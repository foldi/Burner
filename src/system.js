/*global window, document, setTimeout, Burner, Modernizr */
/*jshint supernew:true */

var Item = require('./Item').Item,
    World = require('./World').World,
    Vector = require('./Vector').Vector,
    Utils = require('./Utils').Utils,
    StatsDisplay = require('./StatsDisplay').StatsDisplay;

window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
                              window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

/** @namespace */
var System = {
  name: 'System'
};

/**
 * Holds additional classes that can be defined at runtime.
 * @memberof System
 */
System.Classes = {
  'Item': Item
};

/**
 * Holds a vector describing the system gravity.
 * @memberof System
 */
System.gravity = new Vector(0, 1);

/**
 * Holds a vector describing the system wind.
 * @memberof System
 */
System.wind = new Vector();

/**
 * Stores references to all items in the system.
 * @memberof System
 * @private
 */
System._records = [];

/**
 * Stores references to all items removed from the system.
 * @memberof System
 * @private
 */
System._pool = [];

/**
 * Holds the current and last mouse/touch positions relative
 * to the browser window. Also, holds the current mouse velocity.
 * @public
 */
System.mouse = {
  location: new Vector(),
  lastLocation: new Vector(),
  velocity: new Vector()
};

/**
 * An instance of StatsDisplay.
 * @type {Object}
 * @private
 */
System._statsDisplay = null;

 /**
  * Call to execute any setup code before starting the animation loop.
  * @function setup
  * @param  {Object} opt_func   A function to run before the function exits.
  * @param  {Object|Array} opt_worlds A instance or array of instances of World.
  * @memberof System
  */
System.setup = function(opt_func, opt_worlds) {

  var worlds = opt_worlds || new World(document.body),
      func = opt_func || function() {}, i, l, max;

  if (Object.prototype.toString.call(worlds) === '[object Array]') {
    l = worlds.length;
    for (i = 0, max = l; i < max; i++) {
      System._addWorld(worlds[i]);
    }
  } else {
    System._addWorld(worlds);
  }

  l = System._records.length;
  for (i = 0, max = l; i < max; i++) {
    System._records[i].init();
  }

  document.body.onorientationchange = System.updateOrientation;

  // save the current and last mouse position
  Utils.addEvent(document, 'mousemove', System._recordMouseLoc);

  // save the current and last touch position
  Utils.addEvent(window, 'touchstart', System._recordMouseLoc);
  Utils.addEvent(window, 'touchmove', System._recordMouseLoc);
  Utils.addEvent(window, 'touchend', System._recordMouseLoc);

  // listen for key up
  Utils.addEvent(window, 'keyup', System._keyup);

  // save the setup callback in case we need to reset the system.
  System.setupFunc = func;

  System.setupFunc.call(this);
};

 /**
  * Call to execute any setup code before starting the animation loop.
  * Note: Deprecated in v3. Use setup();
  * @function setup
  * @param  {Object} opt_func   A function to run before the function exits.
  * @param  {Object|Array} opt_worlds A instance or array of instances of World.
  * @memberof System
  */
System.init = function(opt_func, opt_worlds) {
  System.setup(opt_func, opt_worlds);
};

/**
 * Adds world to System records and worlds cache.
 *
 * @function _addWorld
 * @memberof System
 * @private
 * @param {Object} world An instance of World.
 */
System._addWorld = function(world) {
  System._records.push(world);
};

/**
 * Adds instances of class to _records and calls init on them.
 * @function add
 * @memberof System
 * @param {string} klass The name of the class to add.
 * @param {Object} [opt_options=] A map of initial properties.
 * @param {string=} [opt_world = System._records[0]] An instance of World to contain the item.
 * @returns {Object} An instance of the added item.
 */
System.add = function(klass, opt_options, opt_world) {

  var records = this._records,
      options = opt_options || {},
      world = opt_world || System._records[0];

  options.name = klass;

  // recycle object if one is available
  if (System._pool.length) {
    records[records.length] = System._cleanObj(System._pool.splice(0, 1)[0]);
  } else {
    if (System.Classes[klass]) {
      records.push(new System.Classes[klass](options));
    } else {
      records.push(new Item());
    }
  }
  records[records.length - 1].init(world, options);
  return records[records.length - 1];
};

/**
 * Removes all properties from the passed object.
 * @param  {Object} obj An object.
 * @return {Object}     The passed object.
 */
System._cleanObj = function(obj) {
  for (var prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      delete obj[prop];
    }
  }
  return obj;
};

/**
 * Removes an item from the system.
 * @function remove
 * @memberof System
 * @param {Object} obj The item to remove.
 */
System.remove = function (obj) {

  var i, max, records = System._records;

  for (i = 0, max = records.length; i < max; i++) {
    if (records[i].id === obj.id) {
      records[i].el.style.visibility = 'hidden'; // hide item
      System._pool[System._pool.length] = records.splice(i, 1)[0]; // move record to pool array
      break;
    }
  }
};

/**
 * Removes an item from the system.
 * Note: Deprecated in v3. Use remove().
 * @function remove
 * @memberof System
 * @param {Object} obj The item to remove.
 */
System.destroy = function (obj) {
  System.remove(obj);
};

/**
 * Iterates over records.
 * @function loop
 * @memberof System
 */
System.loop = function() {

  var i, records = System._records,
      len = System._records.length;

  for (i = len - 1; i >= 0; i -= 1) {
    if (records[i].step && !records[i].world.pauseStep) {
      records[i].step();
    }
  }
  len = System._records.length; // check length in case items were removed in step()
  for (i = len - 1; i >= 0; i -= 1) {
    records[i].draw();
  }
  if (StatsDisplay.active) {
    StatsDisplay.update(len);
  }
  if (typeof window.requestAnimationFrame !== 'undefined') {
    window.requestAnimationFrame(System.loop);
  }
};

/**
 * Pauses the system and processes one step in records.
 *
 * @function _stepForward
 * @memberof System
 * @private
 */
System._stepForward = function() {

  var i, j, max, records = System._records,
      world, worlds = System.allWorlds();

  for (i = 0, max = worlds.length; i < max; i++) {
    world = worlds[i];
    world.pauseStep = true;
    for (j = records.length - 1; j >= 0; j -= 1) {
      if (records[j].step) {
        records[j].step();
      }
    }
    for (j = records.length - 1; j >= 0; j -= 1) {
      if (records[j].draw) {
        records[j].draw();
      }
    }
  }
};

System._resetSystem = function() {

};

/**
 * Saves the mouse/touch location relative to the browser window.
 *
 * @function _recordMouseLoc
 * @memberof System
 * @private
 */
System._recordMouseLoc = function(e) {

  var touch, world = System.firstWorld();

  System.mouse.lastLocation.x = System.mouse.location.x;
  System.mouse.lastLocation.y = System.mouse.location.y;

  if (e.changedTouches) {
    touch = e.changedTouches[0];
  }

  /**
   * Mapping window size to world size allows us to
   * lead an agent around a world that's not bound
   * to the window.
   */
  if (e.pageX && e.pageY) {
    System.mouse.location.x = Utils.map(e.pageX, 0, window.innerWidth, 0, world.width);
    System.mouse.location.y = Utils.map(e.pageY, 0, window.innerHeight, 0, world.height);
  } else if (e.clientX && e.clientY) {
    System.mouse.location.x = Utils.map(e.clientX, 0, window.innerWidth, 0, world.width);
    System.mouse.location.y = Utils.map(e.clientY, 0, window.innerHeight, 0, world.height);
  } else if (touch) {
    System.mouse.location.x = touch.pageX;
    System.mouse.location.y = touch.pageY;
  }

  System.mouse.velocity.x = System.mouse.lastLocation.x - System.mouse.location.x;
  System.mouse.velocity.y = System.mouse.lastLocation.y - System.mouse.location.y;
};

/**
 * Returns the first world in the system.
 *
 * @function firstWorld
 * @memberof System
 * @returns {null|Object} An instance of World.
 */
System.firstWorld = function() {
  return this._records.length ? this._records[0] : null;
};

/**
 * Returns all worlds.
 *
 * @function allWorlds
 * @memberof System
 * @return {Array.<World>} An array of worlds.
 */
System.allWorlds = function() {
  return System.getAllItemsByName('World');
};

/**
 * Returns an array of items created from the same constructor.
 *
 * @function getAllItemsByName
 * @memberof System
 * @param {string} name The 'name' property.
 * @param {Array} [opt_list = this._records] An optional list of items.
 * @returns {Array} An array of items.
 */
System.getAllItemsByName = function(name, opt_list) {

  var i, max, arr = [],
      list = opt_list || this._records;

  for (i = 0, max = list.length; i < max; i++) {
    if (list[i].name === name) {
      arr[arr.length] = list[i];
    }
  }
  return arr;
};

/**
 * Handles orientation evenst and forces the world to update its bounds.
 *
 * @function updateOrientation
 * @memberof System
 */
System.updateOrientation = function() {
  var worlds = System.allWorlds(),
  i, max, l = worlds.length;
  for (i = 0; i < l; i++) {
    worlds[i].width = worlds[i].el.scrollWidth;
    worlds[i].height = worlds[i].el.scrollHeight;
  }
};

/**
 * Handles keyup events.
 *
 * @function _keyup
 * @memberof System
 * @private
 * @param {Object} e An event.
 */
System._keyup = function(e) {

  var i, max, world, worlds = System.allWorlds();

  switch(e.keyCode) {
    case 39:
      System._stepForward();
      break;
    case 80: // p; pause/play
      for (i = 0, max = worlds.length; i < max; i++) {
        world = worlds[i];
        world.pauseStep = !world.pauseStep;
      }
      break;
    case 82: // r; reset
      System._resetSystem();
      break;
    case 83: // s; reset
      System._toggleStats();
      break;
  }
};

/**
 * Resets the system.
 *
 * @function _resetSystem
 * @memberof System
 * @private
 */
System._resetSystem = function() {

  var i, max, world, worlds = System.allWorlds();

  for (i = 0, max = worlds.length; i < max; i++) {
    world = worlds[i];
    world.pauseStep = false;
    world.pauseDraw = false;

    while(world.el.firstChild) {
      world.el.removeChild(world.el.firstChild);
    }
  }

  System._records = [];
  System._pool = [];
  System.setup(System.setupFunc);
};

/**
 * Toggles stats display.
 *
 * @function _toggleStats
 * @memberof System
 * @private
 */
System._toggleStats = function() {
  if (!StatsDisplay.fps) {
    StatsDisplay.init();
  } else {
    StatsDisplay.active = !StatsDisplay.active;
  }

  if (!StatsDisplay.active) {
    StatsDisplay.hide();
  } else {
    StatsDisplay.show();
  }
};

module.exports.System = System;
