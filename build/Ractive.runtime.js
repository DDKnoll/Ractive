/*! Ractive - v0.3.5 - 2013-08-17
* Next-generation DOM manipulation

* http://ractivejs.org
* Copyright (c) 2013 Rich Harris; Licensed MIT */

/*jslint eqeq: true, plusplus: true */
/*global document, HTMLElement */


(function ( global ) {

'use strict';

var Ractive,

// current version
VERSION = '0.3.5',

doc = global.document || null,

// Ractive prototype
proto = {},

// properties of the public Ractive object
adaptors = {},
eventDefinitions = {},
easing,
extend,
parse,
interpolate,
interpolators,
transitions = {},


// internal utils - instance-specific
teardown,
clearCache,
registerDependant,
unregisterDependant,
notifyDependants,
notifyMultipleDependants,
notifyDependantsByPriority,
resolveRef,
processDeferredUpdates,


// internal utils
splitKeypath,
toString,
isArray,
isObject,
isNumeric,
isEqual,
getEl,
insertHtml,
reassignFragments,
executeTransition,
getPartialDescriptor,
getComponentConstructor,
isStringFragmentSimple,
makeTransitionManager,
requestAnimationFrame,
defineProperty,
defineProperties,
create,
createFromNull,
hasOwn = {}.hasOwnProperty,
noop = function () {},
addEventProxies,
addEventProxy,
appendElementChildren,
bindElement,
createElementAttributes,
getElementNamespace,
updateAttribute,
bindAttribute,
console = global.console || { log: noop, warn: noop },


// internally used caches
keypathCache = {},


// internally used constructors
DomFragment,
DomElement,
DomAttribute,
DomPartial,
DomComponent,
DomInterpolator,
DomTriple,
DomSection,
DomText,

StringFragment,
StringInterpolator,
StringSection,
StringText,

ExpressionResolver,
Evaluator,
Animation,


// internally used regexes
leadingWhitespace = /^\s+/,
trailingWhitespace = /\s+$/,


// other bits and pieces
render,

initMustache,
updateMustache,
resolveMustache,

initFragment,
updateSection,

animationCollection,


// array modification
registerKeypathToArray,
unregisterKeypathFromArray,


// parser and tokenizer
getFragmentStubFromTokens,
getToken,
tokenize,
stripCommentTokens,
stripHtmlComments,
stripStandalones,


// error messages
missingParser = 'Missing Ractive.parse - cannot parse template. Either preparse or use the version that includes the parser',


// constants
TEXT              = 1,
INTERPOLATOR      = 2,
TRIPLE            = 3,
SECTION           = 4,
INVERTED          = 5,
CLOSING           = 6,
ELEMENT           = 7,
PARTIAL           = 8,
COMMENT           = 9,
DELIMCHANGE       = 10,
MUSTACHE          = 11,
TAG               = 12,

COMPONENT         = 15,

NUMBER_LITERAL    = 20,
STRING_LITERAL    = 21,
ARRAY_LITERAL     = 22,
OBJECT_LITERAL    = 23,
BOOLEAN_LITERAL   = 24,

GLOBAL            = 26,
KEY_VALUE_PAIR    = 27,


REFERENCE         = 30,
REFINEMENT        = 31,
MEMBER            = 32,
PREFIX_OPERATOR   = 33,
BRACKETED         = 34,
CONDITIONAL       = 35,
INFIX_OPERATOR    = 36,

INVOCATION        = 40,

UNSET             = { unset: true },

testDiv = ( doc ? doc.createElement( 'div' ) : null ),
noMagic,


// namespaces
namespaces = {
	html:   'http://www.w3.org/1999/xhtml',
	mathml: 'http://www.w3.org/1998/Math/MathML',
	svg:    'http://www.w3.org/2000/svg',
	xlink:  'http://www.w3.org/1999/xlink',
	xml:    'http://www.w3.org/XML/1998/namespace',
	xmlns:  'http://www.w3.org/2000/xmlns/'
};



// we're creating a defineProperty function here - we don't want to add
// this to _legacy.js since it's not a polyfill. It won't allow us to set
// non-enumerable properties. That shouldn't be a problem, unless you're
// using for...in on a (modified) array, in which case you deserve what's
// coming anyway
try {
	Object.defineProperty({}, 'test', { value: 0 });
	Object.defineProperties({}, { test: { value: 0 } });

	if ( doc ) {
		Object.defineProperty( testDiv, 'test', { value: 0 });
		Object.defineProperties( testDiv, { test: { value: 0 } });
	}

	defineProperty = Object.defineProperty;
	defineProperties = Object.defineProperties;
} catch ( err ) {
	// Object.defineProperty doesn't exist, or we're in IE8 where you can
	// only use it with DOM objects (what the fuck were you smoking, MSFT?)
	defineProperty = function ( obj, prop, desc ) {
		obj[ prop ] = desc.value;
	};

	defineProperties = function ( obj, props ) {
		var prop;

		for ( prop in props ) {
			if ( props.hasOwnProperty( prop ) ) {
				defineProperty( obj, prop, props[ prop ] );
			}
		}
	};

	noMagic = true;
}


try {
	Object.create( null );

	create = Object.create;

	createFromNull = function () {
		return Object.create( null );
	};
} catch ( err ) {
	// sigh
	create = (function () {
		var F = function () {};

		return function ( proto, props ) {
			var obj;

			F.prototype = proto;
			obj = new F();

			if ( props ) {
				Object.defineProperties( obj, props );
			}

			return obj;
		};
	}());

	createFromNull = function () {
		return {}; // hope you're not modifying the Object prototype
	};
}



var hyphenate = function ( str ) {
	return str.replace( /[A-Z]/g, function ( match ) {
		return '-' + match.toLowerCase();
	});
};

// determine some facts about our environment
var cssTransitionsEnabled, transition, transitionend;

(function () {

	if ( !doc ) {
		return;
	}

	if ( testDiv.style.transition !== undefined ) {
		transition = 'transition';
		transitionend = 'transitionend';
		cssTransitionsEnabled = true;
	} else if ( testDiv.style.webkitTransition !== undefined ) {
		transition = 'webkitTransition';
		transitionend = 'webkitTransitionEnd';
		cssTransitionsEnabled = true;
	} else {
		cssTransitionsEnabled = false;
	}

}());
(function () {

	var getInterpolator,
		updateModel,
		getBinding,
		inheritProperties,
		arrayContentsMatch,
		MultipleSelectBinding,
		SelectBinding,
		RadioNameBinding,
		CheckboxNameBinding,
		CheckedBinding,
		FileListBinding,
		GenericBinding;

	bindAttribute = function () {
		var node = this.parentNode, interpolator, binding;

		if ( !this.fragment ) {
			return false; // report failure
		}

		interpolator = getInterpolator( this );

		if ( !interpolator ) {
			return false; // report failure
		}

		this.interpolator = interpolator;

		// Hmmm. Not sure if this is the best way to handle this ambiguity...
		//
		// Let's say we were given `value="{{bar}}"`. If the context stack was
		// context stack was `["foo"]`, and `foo.bar` *wasn't* `undefined`, the
		// keypath would be `foo.bar`. Then, any user input would result in
		// `foo.bar` being updated.
		//
		// If, however, `foo.bar` *was* undefined, and so was `bar`, we would be
		// left with an unresolved partial keypath - so we are forced to make an
		// assumption. That assumption is that the input in question should
		// be forced to resolve to `bar`, and any user input would affect `bar`
		// and not `foo.bar`.
		//
		// Did that make any sense? No? Oh. Sorry. Well the moral of the story is
		// be explicit when using two-way data-binding about what keypath you're
		// updating. Using it in lists is probably a recipe for confusion...
		this.keypath = interpolator.keypath || interpolator.descriptor.r;

		//this.updateModel = getUpdater( this );
		binding = getBinding( this );

		if ( !binding ) {
			return false;
		}

		node._ractive.binding = binding;
		this.twoway = true;

		return true;
	};

	updateModel = function () {
		this._ractive.binding.update();
	};

	getInterpolator = function ( attribute ) {
		var item;

		// TODO refactor this? Couldn't the interpolator have got a keypath via an expression?
		// Check this is a suitable candidate for two-way binding - i.e. it is
		// a single interpolator, which isn't an expression
		if ( attribute.fragment.items.length !== 1 ) {
			return null;
		}

		item = attribute.fragment.items[0];
			
		if ( item.type !== INTERPOLATOR ) {
			return null;
		}

		if ( !item.keypath && !item.ref ) {
			return null;
		}

		return item;
	};

	getBinding = function ( attribute ) {
		var node = attribute.parentNode;

		if ( node.tagName === 'SELECT' ) {
			return ( node.multiple ? new MultipleSelectBinding( attribute, node ) : new SelectBinding( attribute, node ) );
		}

		if ( node.type === 'checkbox' || node.type === 'radio' ) {
			if ( attribute.propertyName === 'name' ) {
				if ( node.type === 'checkbox' ) {
					return new CheckboxNameBinding( attribute, node );
				}

				if ( node.type === 'radio' ) {
					return new RadioNameBinding( attribute, node );
				}
			}

			if ( attribute.propertyName === 'checked' ) {
				return new CheckedBinding( attribute, node );
			}

			return null;
		}

		if ( attribute.propertyName !== 'value' ) {
			console.warn( 'This is... odd' );
		}

		if ( attribute.parentNode.type === 'file' ) {
			return new FileListBinding( attribute, node );
		}

		return new GenericBinding( attribute, node );
	};

	MultipleSelectBinding = function ( attribute, node ) {
		inheritProperties( this, attribute, node );
		node.addEventListener( 'change', updateModel, false );
	};

	MultipleSelectBinding.prototype = {
		update: function () {
			var attribute, value, selectedOptions, i, previousValue, changed, len;

			attribute = this.attr;
			previousValue = attribute.value || [];

			value = [];
			selectedOptions = this.node.querySelectorAll( 'option:checked' );
			len = selectedOptions.length;

			for ( i=0; i<len; i+=1 ) {
				value[ value.length ] = selectedOptions[i]._ractive.value;
			}

			// has the selection changed?
			changed = ( len !== previousValue.length );
			i = value.length;
			while ( i-- ) {
				if ( value[i] !== previousValue[i] ) {
					changed = true;
				}
			}

			if ( changed = true ) {
				attribute.value = value;
				this.root.set( this.keypath, value );
			}
		},

		teardown: function () {
			this.node.removeEventListener( 'change', updateModel, false );
		}
	};

	SelectBinding = function ( attribute, node ) {
		inheritProperties( this, attribute, node );
		node.addEventListener( 'change', updateModel, false );
	};

	SelectBinding.prototype = {
		update: function () {
			var selectedOption, value;

			selectedOption = this.node.querySelector( 'option:checked' );

			if ( !selectedOption ) {
				return;
			}

			value = selectedOption._ractive.value;

			this.attr.value = value;
			this.root.set( this.keypath, value );
		},

		teardown: function () {
			this.node.removeEventListener( 'change', updateModel, false );
		}
	};

	RadioNameBinding = function ( attribute, node ) {
		inheritProperties( this, attribute, node );

		node.name = '{{' + attribute.keypath + '}}';

		node.addEventListener( 'change', updateModel, false );

		if ( node.attachEvent ) {
			node.addEventListener( 'click', updateModel, false );
		}
	};

	RadioNameBinding.prototype = {
		update: function () {
			var node = this.node;

			if ( node.checked ) {
				this.root.set( this.keypath, node._ractive ? node._ractive.value : node.value );
			}
		},

		teardown: function () {
			this.node.removeEventListener( 'change', updateModel, false );
			this.node.removeEventListener( 'click', updateModel, false );
		}
	};

	CheckboxNameBinding = function ( attribute, node ) {
		inheritProperties( this, attribute, node );

		node.name = '{{' + this.keypath + '}}';
		this.query = 'input[type="checkbox"][name="' + node.name + '"]';

		node.addEventListener( 'change', updateModel, false );

		if ( node.attachEvent ) {
			node.addEventListener( 'click', updateModel, false );
		}
	};

	CheckboxNameBinding.prototype = {
		update: function () {
			var previousValue, value, checkboxes, len, i, checkbox;

			previousValue = this.root.get( this.keypath );

			// TODO is this overkill?
			checkboxes = this.root.el.querySelectorAll( this.query );

			len = checkboxes.length;
			value = [];

			for ( i=0; i<len; i+=1 ) {
				checkbox = checkboxes[i];

				if ( checkbox.checked ) {
					value[ value.length ] = checkbox._ractive.value;
				}
			}

			if ( !arrayContentsMatch( previousValue, value ) ) {
				this.root.set( this.keypath, value );
			}
		},

		teardown: function () {
			this.node.removeEventListener( 'change', updateModel, false );
			this.node.removeEventListener( 'click', updateModel, false );
		}
	};

	CheckedBinding = function ( attribute, node ) {
		inheritProperties( this, attribute, node );

		node.addEventListener( 'change', updateModel, false );

		if ( node.attachEvent ) {
			node.addEventListener( 'click', updateModel, false );
		}
	};

	CheckedBinding.prototype = {
		update: function () {
			this.root.set( this.keypath, this.node.checked );
		},

		teardown: function () {
			this.node.removeEventListener( 'change', updateModel, false );
			this.node.removeEventListener( 'click', updateModel, false );
		}
	};

	FileListBinding = function ( attribute, node ) {
		inheritProperties( this, attribute, node );

		node.addEventListener( 'change', updateModel, false );
	};

	FileListBinding.prototype = {
		update: function () {
			this.attr.root.set( this.attr.keypath, this.attr.parentNode.files );
		},

		teardown: function () {
			this.node.removeEventListener( 'change', updateModel, false );
		}
	};

	GenericBinding = function ( attribute, node ) {
		inheritProperties( this, attribute, node );

		node.addEventListener( 'change', updateModel, false );

		if ( !this.root.lazy ) {
			node.addEventListener( 'input', updateModel, false );
		}

		if ( node.attachEvent ) {
			node.addEventListener( 'keyup', updateModel, false );
		}
	};

	GenericBinding.prototype = {
		update: function () {
			var attribute = this.attr, value = attribute.parentNode.value;

			// so that we can do +value || value below
			if ( value === '0' ) {
				value = 0;
			}

			else if ( value !== '' ) {
				value = +value || value;
			}

			attribute.root.set( attribute.keypath, value );
		},

		teardown: function () {
			this.node.removeEventListener( 'change', updateModel, false );
			this.node.removeEventListener( 'input', updateModel, false );
			this.node.removeEventListener( 'keyup', updateModel, false );
		}
	};

	inheritProperties = function ( binding, attribute, node ) {
		binding.attr = attribute;
		binding.node = node;
		binding.root = attribute.root;
		binding.keypath = attribute.keypath;
	};

	arrayContentsMatch = function ( a, b ) {
		var i;

		if ( !isArray( a ) || !isArray( b ) ) {
			return false;
		}

		if ( a.length !== b.length ) {
			return false;
		}

		i = a.length;
		while ( i-- ) {
			if ( a[i] !== b[i] ) {
				return false;
			}
		}

		return true;
	};

}());
(function () {

	var updateFileInputValue, deferSelect, initSelect, updateSelect, updateMultipleSelect, updateRadioName, updateCheckboxName, updateEverythingElse;

	// There are a few special cases when it comes to updating attributes. For this reason,
	// the prototype .update() method points to updateAttribute, which waits until the
	// attribute has finished initialising, then replaces the prototype method with a more
	// suitable one. That way, we save ourselves doing a bunch of tests on each call
	updateAttribute = function () {
		var node;

		if ( !this.ready ) {
			return this; // avoid items bubbling to the surface when we're still initialising
		}

		node = this.parentNode;

		// special case - selects
		if ( node.tagName === 'SELECT' && this.name === 'value' ) {
			this.update = deferSelect;
			this.deferredUpdate = initSelect; // we don't know yet if it's a select-one or select-multiple

			return this.update();
		}

		// special case - <input type='file' value='{{fileList}}'>
		if ( this.isFileInputValue ) {
			this.update = updateFileInputValue; // save ourselves the trouble next time
			return this;
		}

		// special case - <input type='radio' name='{{twoway}}' value='foo'>
		if ( this.twoway && this.name === 'name' ) {
			if ( node.type === 'radio' ) {
				this.update = updateRadioName;
				return this.update();
			}

			if ( node.type === 'checkbox' ) {
				this.update = updateCheckboxName;
				return this.update();
			}
		}

		this.update = updateEverythingElse;
		return this.update();
	};

	updateFileInputValue = function () {
		return this; // noop - file inputs are readonly
	};

	initSelect = function () {
		// we're now in a position to decide whether this is a select-one or select-multiple
		this.deferredUpdate = ( this.parentNode.multiple ? updateMultipleSelect : updateSelect );
		this.deferredUpdate();
	};

	deferSelect = function () {
		// because select values depend partly on the values of their children, and their
		// children may be entering and leaving the DOM, we wait until updates are
		// complete before updating
		this.root._defSelectValues.push( this );
		return this;
	};

	updateSelect = function () {
		var value = this.fragment.getValue(), options, option, i;

		this.value = value;

		options = this.parentNode.querySelectorAll( 'option' );
		i = options.length;

		while ( i-- ) {
			option = options[i];

			if ( option._ractive.value === value ) {
				option.selected = true;
				return this;
			}
		}

		// if we're still here, it means the new value didn't match any of the options...
		// TODO figure out what to do in this situation
		
		return this;
	};

	updateMultipleSelect = function () {
		var value = this.fragment.getValue(), options, i;

		if ( !isArray( value ) ) {
			value = [ value ];
		}

		options = this.parentNode.querySelectorAll( 'option' );
		i = options.length;

		while ( i-- ) {
			options[i].selected = ( value.indexOf( options[i]._ractive.value ) !== -1 );
		}

		this.value = value;

		return this;
	};

	updateRadioName = function () {
		var node, value;

		node = this.parentNode;
		value = this.fragment.getValue();

		node.checked = ( value === node._ractive.value );

		return this;
	};

	updateCheckboxName = function () {
		var node, value;

		node = this.parentNode;
		value = this.fragment.getValue();

		if ( !isArray( value ) ) {
			node.checked = ( value === node._ractive.value );
			return this;
		}

		node.checked = ( value.indexOf( node._ractive.value ) !== -1 );

		return this;
	};

	updateEverythingElse = function () {
		var node, value;

		node = this.parentNode;
		value = this.fragment.getValue();

		// store actual value, so it doesn't get coerced to a string
		if ( this.isValueAttribute ) {
			node._ractive.value = value;
		}

		if ( value === undefined ) {
			value = '';
		}

		if ( value !== this.value ) {
			if ( this.useProperty ) {
				
				node[ this.propertyName ] = value;
				this.value = value;

				return this;
			}

			if ( this.namespace ) {
				node.setAttributeNS( this.namespace, this.name, value );
				this.value = value;

				return this;
			}

			if ( this.name === 'id' ) {
				if ( this.value !== undefined ) {
					this.root.nodes[ this.value ] = undefined;
				}

				this.root.nodes[ value ] = node;
			}

			node.setAttribute( this.name, value );

			this.value = value;
		}

		return this;
	};

}());
addEventProxies = function ( element, proxies ) {
	var i, eventName, eventNames;

	for ( eventName in proxies ) {
		if ( hasOwn.call( proxies, eventName ) ) {
			eventNames = eventName.split( '-' );
			i = eventNames.length;

			while ( i-- ) {
				addEventProxy( element, eventNames[i], proxies[ eventName ], element.parentFragment.contextStack );
			}
		}
	}
};
(function () {

	var MasterEventHandler,
		ProxyEvent,
		firePlainEvent,
		fireEventWithArgs,
		fireEventWithDynamicArgs,
		customHandlers,
		genericHandler,
		getCustomHandler;

	addEventProxy = function ( element, triggerEventName, proxyDescriptor, contextStack, indexRefs ) {
		var events, master;

		events = element.ractify().events;
		master = events[ triggerEventName ] || ( events[ triggerEventName ] = new MasterEventHandler( element, triggerEventName, contextStack, indexRefs ) );

		master.add( proxyDescriptor );
	};

	MasterEventHandler = function ( element, eventName, contextStack ) {
		var definition;

		this.element = element;
		this.root = element.root;
		this.node = element.node;
		this.name = eventName;
		this.contextStack = contextStack; // TODO do we need to pass contextStack down everywhere? Doesn't it belong to the parentFragment?
		this.proxies = [];

		if ( definition = ( this.root.eventDefinitions[ eventName ] || Ractive.eventDefinitions[ eventName ] ) ) {
			this.custom = definition( this.node, getCustomHandler( eventName ) );
		} else {
			this.node.addEventListener( eventName, genericHandler, false );
		}
	};

	MasterEventHandler.prototype = {
		add: function ( proxy ) {
			this.proxies[ this.proxies.length ] = new ProxyEvent( this.element, this.root, proxy, this.contextStack );
		},

		// TODO teardown when element torn down
		teardown: function () {
			var i;

			if ( this.custom ) {
				this.custom.teardown();
			} else {
				this.node.removeEventListener( this.name, genericHandler, false );
			}

			i = this.proxies.length;
			while ( i-- ) {
				this.proxies[i].teardown();
			}
		},

		fire: function ( event ) {
			var i = this.proxies.length;

			while ( i-- ) {
				this.proxies[i].fire( event );
			}
		}
	};

	ProxyEvent = function ( element, ractive, descriptor, contextStack ) {
		var name;

		this.root = ractive;

		name = descriptor.n || descriptor;

		if ( typeof name === 'string' ) {
			this.n = name;
		} else {
			this.n = new StringFragment({
				descriptor:   descriptor.n,
				root:         this.root,
				owner:        element,
				contextStack: contextStack
			});
		}

		if ( descriptor.a ) {
			this.a = descriptor.a;
			this.fire = fireEventWithArgs;
			return;
		}

		if ( descriptor.d ) {
			this.d = new StringFragment({
				descriptor:   descriptor.d,
				root:         this.root,
				owner:        element,
				contextStack: contextStack
			});
			this.fire = fireEventWithDynamicArgs;
			return;
		}

		this.fire = firePlainEvent;
	};

	ProxyEvent.prototype = {
		teardown: function () {
			if ( this.n.teardown) {
				this.n.teardown();
			}

			if ( this.d ) {
				this.d.teardown();
			}
		},

		bubble: noop // TODO can we get rid of this?
	};

	// the ProxyEvent instance fire method could be any of these
	firePlainEvent = function ( event ) {
		this.root.fire( this.n.toString(), event );
	};

	fireEventWithArgs = function ( event ) {
		this.root.fire( this.n.toString(), event, this.a );
	};

	fireEventWithDynamicArgs = function ( event ) {
		this.root.fire( this.n.toString(), event, this.d.toJSON() );
	};

	// all native DOM events dealt with by Ractive share a single handler
	genericHandler = function ( event ) {
		var storage = this._ractive;

		storage.events[ event.type ].fire({
			node: this,
			original: event,
			index: storage.index,
			keypath: storage.keypath,
			context: storage.root.get( storage.keypath )
		});
	};

	customHandlers = {};

	getCustomHandler = function ( eventName ) {
		if ( customHandlers[ eventName ] ) {
			return customHandlers[ eventName ];
		}

		return customHandlers[ eventName ] = function ( event ) {
			var storage = event.node._ractive;

			event.index = storage.index;
			event.keypath = storage.keypath;
			event.context = storage.root.get( storage.keypath );

			storage.events[ eventName ].fire( event );
		};
	};

}());
appendElementChildren = function ( element, node, descriptor, docFrag ) {
	if ( typeof descriptor.f === 'string' && ( !node || ( !node.namespaceURI || node.namespaceURI === namespaces.html ) ) ) {
		// great! we can use innerHTML
		element.html = descriptor.f;

		if ( docFrag ) {
			node.innerHTML = element.html;
		}
	}

	else {
		// once again, everyone has to suffer because of IE bloody 8
		if ( descriptor.e === 'style' && node.styleSheet !== undefined ) {
			element.fragment = new StringFragment({
				descriptor:   descriptor.f,
				root:         element.root,
				contextStack: element.parentFragment.contextStack,
				owner:        element
			});

			if ( docFrag ) {
				element.bubble = function () {
					node.styleSheet.cssText = element.fragment.toString();
				};
			}
		}

		else {
			element.fragment = new DomFragment({
				descriptor:   descriptor.f,
				root:         element.root,
				parentNode:   node,
				contextStack: element.parentFragment.contextStack,
				owner:        element
			});

			if ( docFrag ) {
				node.appendChild( element.fragment.docFrag );
			}
		}
	}
};
bindElement = function ( element, attributes ) {
	element.ractify();

	// an element can only have one two-way attribute
	switch ( element.descriptor.e ) {
		case 'select':
		case 'textarea':
		if ( attributes.value ) {
			attributes.value.bind();
		}
		return;

		case 'input':

		if ( element.node.type === 'radio' || element.node.type === 'checkbox' ) {
			// we can either bind the name attribute, or the checked attribute - not both
			if ( attributes.name && attributes.name.bind() ) {
				element.node._ractive.binding.update();
				return;
			}

			if ( attributes.checked && attributes.checked.bind() ) {
				return;
			}
		}

		if ( attributes.value && attributes.value.bind() ) {
			return;
		}
	}
};
createElementAttributes = function ( element, attributes ) {
	var attrName, attrValue, attr;

	element.attributes = [];

	for ( attrName in attributes ) {
		if ( hasOwn.call( attributes, attrName ) ) {
			attrValue = attributes[ attrName ];

			attr = new DomAttribute({
				element:      element,
				name:         attrName,
				value:        attrValue,
				root:         element.root,
				parentNode:   element.node,
				contextStack: element.parentFragment.contextStack
			});

			element.attributes[ element.attributes.length ] = attr;

			// name, value and checked attributes are potentially bindable
			if ( attrName === 'value' || attrName === 'name' || attrName === 'checked' ) {
				element.attributes[ attrName ] = attr;
			}

			// The name attribute is a special case - it is the only two-way attribute that updates
			// the viewmodel based on the value of another attribute. For that reason it must wait
			// until the node has been initialised, and the viewmodel has had its first two-way
			// update, before updating itself (otherwise it may disable a checkbox or radio that
			// was enabled in the template)
			if ( attrName !== 'name' ) {
				attr.update();
			}
		}
	}

	return element.attributes;
};
getElementNamespace = function ( descriptor, parentNode ) {
	// if the element has an xmlns attribute, use that
	if ( descriptor.a && descriptor.a.xmlns ) {
		return descriptor.a.xmlns;
	}

	// otherwise, use the svg namespace if this is an svg element, or inherit namespace from parent
	return ( descriptor.e.toLowerCase() === 'svg' ? namespaces.svg : parentNode.namespaceURI );
};
executeTransition = function ( descriptor, root, owner, contextStack, isIntro ) {
	var transitionName, transitionParams, fragment, transitionManager, transition;

	if ( !root.transitionsEnabled ) {
		return;
	}

	if ( typeof descriptor === 'string' ) {
		transitionName = descriptor;
	} else {
		transitionName = descriptor.n;

		if ( descriptor.a ) {
			transitionParams = descriptor.a;
		} else if ( descriptor.d ) {
			fragment = new StringFragment({
				descriptor:   descriptor.d,
				root:         root,
				owner:        owner,
				contextStack: owner.parentFragment.contextStack
			});

			transitionParams = fragment.toJSON();
			fragment.teardown();
		}
	}

	transition = root.transitions[ transitionName ] || Ractive.transitions[ transitionName ];

	if ( transition ) {
		transitionManager = root._transitionManager;

		transitionManager.push( owner.node );
		transition.call( root, owner.node, function () {
			transitionManager.pop( owner.node );
		}, transitionParams, isIntro );
	}
};
getComponentConstructor = function ( root, name ) {
	// TODO... write this properly!
	return root.components[ name ];
};
insertHtml = function ( html, docFrag ) {
	var div, nodes = [];

	div = doc.createElement( 'div' );
	div.innerHTML = html;

	while ( div.firstChild ) {
		nodes[ nodes.length ] = div.firstChild;
		docFrag.appendChild( div.firstChild );
	}

	return nodes;
};
(function () {

	var reassignFragment, reassignElement, reassignMustache;

	reassignFragments = function ( root, section, start, end, by ) {
		var i, fragment, indexRef, oldIndex, newIndex, oldKeypath, newKeypath;

		indexRef = section.descriptor.i;

		for ( i=start; i<end; i+=1 ) {
			fragment = section.fragments[i];

			oldIndex = i - by;
			newIndex = i;

			oldKeypath = section.keypath + '.' + ( i - by );
			newKeypath = section.keypath + '.' + i;

			// change the fragment index
			fragment.index += by;

			reassignFragment( fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
		}

		processDeferredUpdates( root );
	};

	reassignFragment = function ( fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath ) {
		var i, item, context;

		if ( fragment.indexRefs && fragment.indexRefs[ indexRef ] !== undefined ) {
			fragment.indexRefs[ indexRef ] = newIndex;
		}

		// fix context stack
		i = fragment.contextStack.length;
		while ( i-- ) {
			context = fragment.contextStack[i];
			if ( context.substr( 0, oldKeypath.length ) === oldKeypath ) {
				fragment.contextStack[i] = context.replace( oldKeypath, newKeypath );
			}
		}

		i = fragment.items.length;
		while ( i-- ) {
			item = fragment.items[i];

			switch ( item.type ) {
				case ELEMENT:
				reassignElement( item, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
				break;

				case PARTIAL:
				reassignFragment( item.fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
				break;

				case SECTION:
				case INTERPOLATOR:
				case TRIPLE:
				reassignMustache( item, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
				break;
			}
		}
	};

	reassignElement = function ( element, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath ) {
		var i, attribute;

		i = element.attributes.length;
		while ( i-- ) {
			attribute = element.attributes[i];

			if ( attribute.fragment ) {
				reassignFragment( attribute.fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );

				if ( attribute.twoway ) {
					attribute.updateBindings();
				}
			}
		}

		// reassign proxy argument fragments TODO and intro/outro param fragments
		if ( element.proxyFrags ) {
			i = element.proxyFrags.length;
			while ( i-- ) {
				reassignFragment( element.proxyFrags[i], indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
			}
		}

		if ( element.node._ractive ) {
			if ( element.node._ractive.keypath.substr( 0, oldKeypath.length ) === oldKeypath ) {
				element.node._ractive.keypath = element.node._ractive.keypath.replace( oldKeypath, newKeypath );
			}

			if ( indexRef !== undefined ) {
				element.node._ractive.index[ indexRef ] = newIndex;
			}
		}

		// reassign children
		if ( element.fragment ) {
			reassignFragment( element.fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
		}
	};

	reassignMustache = function ( mustache, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath ) {
		var i;

		// expression mustache?
		if ( mustache.descriptor.x ) {
			if ( mustache.keypath ) {
				unregisterDependant( mustache );
			}
			
			if ( mustache.expressionResolver ) {
				mustache.expressionResolver.teardown();
			}

			mustache.expressionResolver = new ExpressionResolver( mustache );
		}

		// normal keypath mustache?
		if ( mustache.keypath ) {
			if ( mustache.keypath.substr( 0, oldKeypath.length ) === oldKeypath ) {
				unregisterDependant( mustache );

				mustache.keypath = mustache.keypath.replace( oldKeypath, newKeypath );
				registerDependant( mustache );
			}
		}

		// index ref mustache?
		else if ( mustache.indexRef === indexRef ) {
			mustache.value = newIndex;
			mustache.render( newIndex );
		}

		// otherwise, it's an unresolved reference. the context stack has been updated
		// so it will take care of itself

		// if it's a section mustache, we need to go through any children
		if ( mustache.fragments ) {
			i = mustache.fragments.length;
			while ( i-- ) {
				reassignFragment( mustache.fragments[i], indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
			}
		}
	};

}());
(function ( cache ) {

	var Reference, getFunctionFromString, thisPattern, wrapFunction;

	Evaluator = function ( root, keypath, functionStr, args, priority ) {
		var i, arg;

		this.root = root;
		this.keypath = keypath;

		this.fn = getFunctionFromString( functionStr, args.length );
		this.values = [];
		this.refs = [];

		i = args.length;
		while ( i-- ) {
			arg = args[i];

			if ( arg[0] ) {
				// this is an index ref... we don't need to register a dependant
				this.values[i] = arg[1];
			}

			else {
				this.refs[ this.refs.length ] = new Reference( root, arg[1], this, i, priority );
			}
		}

		this.selfUpdating = ( this.refs.length <= 1 );
	};

	Evaluator.prototype = {
		bubble: function () {
			// If we only have one reference, we can update immediately...
			if ( this.selfUpdating ) {
				this.update();
			}

			// ...otherwise we want to register it as a deferred item, to be
			// updated once all the information is in, to prevent unnecessary
			// cascading. Only if we're already resolved, obviously
			else if ( !this.deferred ) {
				this.root._defEvals[ this.root._defEvals.length ] = this;
				this.deferred = true;
			}
		},

		update: function () {
			var value;

			// prevent infinite loops
			if ( this.evaluating ) {
				return this;
			}

			this.evaluating = true;
				
			try {
				value = this.fn.apply( null, this.values );
			} catch ( err ) {
				if ( this.root.debug ) {
					throw err;
				} else {
					value = undefined;
				}
			}

			if ( !isEqual( value, this.value ) ) {
				clearCache( this.root, this.keypath );
				this.root._cache[ this.keypath ] = value;
				notifyDependants( this.root, this.keypath );

				this.value = value;
			}

			this.evaluating = false;

			return this;
		},

		// TODO should evaluators ever get torn down?
		teardown: function () {
			while ( this.refs.length ) {
				this.refs.pop().teardown();
			}

			clearCache( this.root, this.keypath );
			this.root._evaluators[ this.keypath ] = null;
		},

		// This method forces the evaluator to sync with the current model
		// in the case of a smart update
		refresh: function () {
			if ( !this.selfUpdating ) {
				this.deferred = true;
			}

			var i = this.refs.length;
			while ( i-- ) {
				this.refs[i].update();
			}

			if ( this.deferred ) {
				this.update();
				this.deferred = false;
			}
		}
	};


	Reference = function ( root, keypath, evaluator, argNum, priority ) {
		var value;

		this.evaluator = evaluator;
		this.keypath = keypath;
		this.root = root;
		this.argNum = argNum;
		this.type = REFERENCE;
		this.priority = priority;

		value = root.get( keypath );

		if ( typeof value === 'function' ) {
			value = value._wrapped || wrapFunction( value, root );
		}

		this.value = evaluator.values[ argNum ] = value;

		registerDependant( this );
	};

	Reference.prototype = {
		update: function () {
			var value = this.root.get( this.keypath );

			if ( typeof value === 'function' ) {
				value = value._wrapped || wrapFunction( value, this.root );
			}

			if ( !isEqual( value, this.value ) ) {
				this.evaluator.values[ this.argNum ] = value;
				this.evaluator.bubble();

				this.value = value;
			}
		},

		teardown: function () {
			unregisterDependant( this );
		}
	};


	getFunctionFromString = function ( str, i ) {
		var fn, args;

		str = str.replace( /\$\{([0-9]+)\}/g, '_$1' );

		if ( cache[ str ] ) {
			return cache[ str ];
		}

		args = [];
		while ( i-- ) {
			args[i] = '_' + i;
		}

		fn = new Function( args.join( ',' ), 'return(' + str + ')' );

		cache[ str ] = fn;
		return fn;
	};

	thisPattern = /this/;

	wrapFunction = function ( fn, ractive ) {
		var prop;

		// if the function doesn't refer to `this`, we don't need
		// to set the context
		if ( !thisPattern.test( fn.toString() ) ) {
			return fn._wrapped = fn;
		}

		// otherwise, we do
		defineProperty( fn, '_wrapped', {
			value: function () {
				return fn.apply( ractive, arguments );
			},
			writable: true
		});

		for ( prop in fn ) {
			if ( hasOwn.call( fn, prop ) ) {
				fn._wrapped[ prop ] = fn[ prop ];
			}
		}

		return fn._wrapped;
	};

}({}));
(function () {

	var ReferenceScout, getKeypath;

	ExpressionResolver = function ( mustache ) {

		var expression, i, len, ref, indexRefs;

		this.root = mustache.root;
		this.mustache = mustache;
		this.args = [];
		this.scouts = [];

		expression = mustache.descriptor.x;
		indexRefs = mustache.parentFragment.indexRefs;

		this.str = expression.s;

		// send out scouts for each reference
		len = this.unresolved = ( expression.r ? expression.r.length : 0 );

		if ( !len ) {
			this.init(); // some expressions don't have references. edge case, but, yeah.
		}

		for ( i=0; i<len; i+=1 ) {
			ref = expression.r[i];
			
			// is this an index ref?
			if ( indexRefs && indexRefs[ ref ] !== undefined ) {
				this.resolveRef( i, true, indexRefs[ ref ] );
			}

			else {
				this.scouts[ this.scouts.length ] = new ReferenceScout( this, ref, mustache.contextStack, i );
			}
		}
	};

	ExpressionResolver.prototype = {
		init: function () {
			this.keypath = getKeypath( this.str, this.args );
			this.createEvaluator();

			this.mustache.resolve( this.keypath );
		},

		teardown: function () {
			while ( this.scouts.length ) {
				this.scouts.pop().teardown();
			}
		},

		resolveRef: function ( argNum, isIndexRef, value ) {
			this.args[ argNum ] = [ isIndexRef, value ];

			// can we initialise yet?
			if ( --this.unresolved ) {
				// no;
				return;
			}

			this.init();
		},

		createEvaluator: function () {
			// only if it doesn't exist yet!
			if ( !this.root._evaluators[ this.keypath ] ) {
				this.root._evaluators[ this.keypath ] = new Evaluator( this.root, this.keypath, this.str, this.args, this.mustache.priority );

				// initialise
				this.root._evaluators[ this.keypath ].update();
			}

			else {
				// we need to trigger a refresh of the evaluator, since it
				// will have become de-synced from the model if we're in a
				// reassignment cycle
				this.root._evaluators[ this.keypath ].refresh();
			}
		}
	};


	ReferenceScout = function ( resolver, ref, contextStack, argNum ) {
		var keypath, root;

		root = this.root = resolver.root;

		keypath = resolveRef( root, ref, contextStack );
		if ( keypath ) {
			resolver.resolveRef( argNum, false, keypath );
		} else {
			this.ref = ref;
			this.argNum = argNum;
			this.resolver = resolver;
			this.contextStack = contextStack;

			root._pendingResolution[ root._pendingResolution.length ] = this;
		}
	};

	ReferenceScout.prototype = {
		resolve: function ( keypath ) {
			this.keypath = keypath;
			this.resolver.resolveRef( this.argNum, false, keypath );
		},

		teardown: function () {
			// if we haven't found a keypath yet, we can
			// stop the search now
			if ( !this.keypath ) {
				teardown( this );
			}
		}
	};

	getKeypath = function ( str, args ) {
		var unique;

		// get string that is unique to this expression
		unique = str.replace( /\$\{([0-9]+)\}/g, function ( match, $1 ) {
			return args[ $1 ][1];
		});

		// then sanitize by removing any periods or square brackets. Otherwise
		// splitKeypath will go mental!
		return '(' + unique.replace( /[\.\[\]]/g, '-' ) + ')';
	};

}());
(function () {

	var getPartialFromRegistry, unpack;

	getPartialDescriptor = function ( root, name ) {
		var el, partial;

		// If the partial was specified on this instance, great
		if ( partial = getPartialFromRegistry( root, name ) ) {
			return partial;
		}

		// If not, is it a global partial?
		if ( partial = getPartialFromRegistry( Ractive, name ) ) {
			return partial;
		}

		// Does it exist on the page as a script tag?
		if ( doc ) {
			el = doc.getElementById( name );
			if ( el && el.tagName === 'SCRIPT' ) {
				if ( !Ractive.parse ) {
					throw new Error( missingParser );
				}

				Ractive.partials[ name ] = Ractive.parse( el.innerHTML );
			}
		}

		partial = Ractive.partials[ name ];

		// No match? Return an empty array
		if ( !partial ) {
			if ( root.debug && console && console.warn ) {
				console.warn( 'Could not find descriptor for partial "' + name + '"' );
			}

			return [];
		}

		return unpack( partial );
	};

	getPartialFromRegistry = function ( registry, name ) {
		if ( registry.partials[ name ] ) {
			
			// If this was added manually to the registry, but hasn't been parsed,
			// parse it now
			if ( typeof registry.partials[ name ] === 'string' ) {
				if ( !Ractive.parse ) {
					throw new Error( missingParser );
				}

				registry.partials[ name ] = Ractive.parse( registry.partials[ name ] );
			}

			return unpack( registry.partials[ name ] );
		}
	};

	unpack = function ( partial ) {
		// Unpack string, if necessary
		if ( partial.length === 1 && typeof partial[0] === 'string' ) {
			return partial[0];
		}

		return partial;
	};

}());
initFragment = function ( fragment, options ) {

	var numItems, i, parentFragment, parentRefs, ref;

	// The item that owns this fragment - an element, section, partial, or attribute
	fragment.owner = options.owner;
	parentFragment = fragment.owner.parentFragment;

	// inherited properties
	fragment.root = options.root;
	fragment.parentNode = options.parentNode;
	fragment.contextStack = options.contextStack || [];

	// If parent item is a section, this may not be the only fragment
	// that belongs to it - we need to make a note of the index
	if ( fragment.owner.type === SECTION ) {
		fragment.index = options.index;
	}

	// index references (the 'i' in {{#section:i}}<!-- -->{{/section}}) need to cascade
	// down the tree
	if ( parentFragment ) {
		parentRefs = parentFragment.indexRefs;

		if ( parentRefs ) {
			fragment.indexRefs = createFromNull(); // avoids need for hasOwnProperty

			for ( ref in parentRefs ) {
				fragment.indexRefs[ ref ] = parentRefs[ ref ];
			}
		}
	}

	// inherit priority
	fragment.priority = ( parentFragment ? parentFragment.priority + 1 : 0 );

	if ( options.indexRef ) {
		if ( !fragment.indexRefs ) {
			fragment.indexRefs = {};
		}

		fragment.indexRefs[ options.indexRef ] = options.index;
	}

	// Time to create this fragment's child items;
	fragment.items = [];

	numItems = ( options.descriptor ? options.descriptor.length : 0 );
	for ( i=0; i<numItems; i+=1 ) {
		fragment.items[ fragment.items.length ] = fragment.createItem({
			parentFragment: fragment,
			descriptor: options.descriptor[i],
			index: i
		});
	}

};
isStringFragmentSimple = function ( fragment ) {
	var i, item, containsInterpolator;

	i = fragment.items.length;
	while ( i-- ) {
		item = fragment.items[i];
		if ( item.type === TEXT ) {
			continue;
		}

		// we can only have one interpolator and still be self-updating
		if ( item.type === INTERPOLATOR ) {
			if ( containsInterpolator ) {
				return false;
			} else {
				containsInterpolator = true;
				continue;
			}
		}

		// anything that isn't text or an interpolator (i.e. a section)
		// and we can't self-update
		return false;
	}

	return true;
};
initMustache = function ( mustache, options ) {

	var keypath, indexRef, parentFragment;

	parentFragment = mustache.parentFragment = options.parentFragment;

	mustache.root           = parentFragment.root;
	mustache.contextStack   = parentFragment.contextStack;
	
	mustache.descriptor     = options.descriptor;
	mustache.index          = options.index || 0;
	mustache.priority       = parentFragment.priority;

	// DOM only
	if ( parentFragment.parentNode ) {
		mustache.parentNode = parentFragment.parentNode;
	}

	mustache.type = options.descriptor.t;


	// if this is a simple mustache, with a reference, we just need to resolve
	// the reference to a keypath
	if ( options.descriptor.r ) {
		if ( parentFragment.indexRefs && parentFragment.indexRefs[ options.descriptor.r ] !== undefined ) {
			indexRef = parentFragment.indexRefs[ options.descriptor.r ];

			mustache.indexRef = options.descriptor.r;
			mustache.value = indexRef;
			mustache.render( mustache.value );
		}

		else {
			keypath = resolveRef( mustache.root, options.descriptor.r, mustache.contextStack );
			if ( keypath ) {
				mustache.resolve( keypath );
			} else {
				mustache.ref = options.descriptor.r;
				mustache.root._pendingResolution[ mustache.root._pendingResolution.length ] = mustache;

				// inverted section? initialise
				if ( mustache.descriptor.n ) {
					mustache.render( false );
				}
			}
		}
	}

	// if it's an expression, we have a bit more work to do
	if ( options.descriptor.x ) {
		mustache.expressionResolver = new ExpressionResolver( mustache );
	}

};


// methods to add to individual mustache prototypes
updateMustache = function () {
	var value;

	value = this.root.get( this.keypath, true );

	if ( !isEqual( value, this.value ) ) {
		this.render( value );
		this.value = value;
	}
};

resolveMustache = function ( keypath ) {
	this.keypath = keypath;

	registerDependant( this );
	
	this.update();

	if ( this.expressionResolver ) {
		this.expressionResolver = null;
	}
};
(function () {

	var updateListSection, updateContextSection, updateConditionalSection;

	updateSection = function ( section, value ) {
		var fragmentOptions;

		fragmentOptions = {
			descriptor: section.descriptor.f,
			root:       section.root,
			parentNode: section.parentNode,
			owner:      section
		};

		// if section is inverted, only check for truthiness/falsiness
		if ( section.descriptor.n ) {
			updateConditionalSection( section, value, true, fragmentOptions );
			return;
		}

		// otherwise we need to work out what sort of section we're dealing with

		// if value is an array, iterate through
		if ( isArray( value ) ) {
			updateListSection( section, value, fragmentOptions );
		}


		// if value is a hash...
		else if ( isObject( value ) ) {
			updateContextSection( section, fragmentOptions );
		}


		// otherwise render if value is truthy, unrender if falsy
		else {
			updateConditionalSection( section, value, false, fragmentOptions );
		}
	};

	updateListSection = function ( section, value, fragmentOptions ) {
		var i, fragmentsToRemove;

		// if the array is shorter than it was previously, remove items
		if ( value.length < section.length ) {
			fragmentsToRemove = section.fragments.splice( value.length, section.length - value.length );

			while ( fragmentsToRemove.length ) {
				fragmentsToRemove.pop().teardown( true );
			}
		}

		// otherwise...
		else {

			if ( value.length > section.length ) {
				// add any new ones
				for ( i=section.length; i<value.length; i+=1 ) {
					// append list item to context stack
					fragmentOptions.contextStack = section.contextStack.concat( section.keypath + '.' + i );
					fragmentOptions.index = i;

					if ( section.descriptor.i ) {
						fragmentOptions.indexRef = section.descriptor.i;
					}

					section.fragments[i] = section.createFragment( fragmentOptions );
				}
			}
		}

		section.length = value.length;
	};

	updateContextSection = function ( section, fragmentOptions ) {
		// ...then if it isn't rendered, render it, adding section.keypath to the context stack
		// (if it is already rendered, then any children dependent on the context stack
		// will update themselves without any prompting)
		if ( !section.length ) {
			// append this section to the context stack
			fragmentOptions.contextStack = section.contextStack.concat( section.keypath );
			fragmentOptions.index = 0;

			section.fragments[0] = section.createFragment( fragmentOptions );
			section.length = 1;
		}
	};

	updateConditionalSection = function ( section, value, inverted, fragmentOptions ) {
		var doRender, emptyArray, fragmentsToRemove;

		emptyArray = ( isArray( value ) && value.length === 0 );

		if ( inverted ) {
			doRender = emptyArray || !value;
		} else {
			doRender = value && !emptyArray;
		}

		if ( doRender ) {
			if ( !section.length ) {
				// no change to context stack
				fragmentOptions.contextStack = section.contextStack;
				fragmentOptions.index = 0;

				section.fragments[0] = section.createFragment( fragmentOptions );
				section.length = 1;
			}

			if ( section.length > 1 ) {
				fragmentsToRemove = section.fragments.splice( 1 );
				
				while ( fragmentsToRemove.length ) {
					fragmentsToRemove.pop().teardown( true );
				}
			}
		}

		else if ( section.length ) {
			section.teardownFragments( true );
			section.length = 0;
		}
	};

}());
(function ( proto ) {

	var add = function ( root, keypath, d ) {
		var value;

		if ( typeof keypath !== 'string' || !isNumeric( d ) ) {
			if ( root.debug ) {
				throw new Error( 'Bad arguments' );
			}
			return;
		}

		value = root.get( keypath );

		if ( value === undefined ) {
			value = 0;
		}

		if ( !isNumeric( value ) ) {
			if ( root.debug ) {
				throw new Error( 'Cannot add to a non-numeric value' );
			}
			return;
		}

		root.set( keypath, value + d );
	};

	proto.add = function ( keypath, d ) {
		add( this, keypath, ( d === undefined ? 1 : d ) );
	};

	proto.subtract = function ( keypath, d ) {
		add( this, keypath, ( d === undefined ? -1 : -d ) );
	};

	proto.toggle = function ( keypath ) {
		var value;

		if ( typeof keypath !== 'string' ) {
			if ( this.debug ) {
				throw new Error( 'Bad arguments' );
			}
			return;
		}

		value = this.get( keypath );
		this.set( keypath, !value );
	};

}( proto ));
(function ( proto ) {

	var animate, noAnimation;

	proto.animate = function ( keypath, to, options ) {
		
		var k, animation, animations;

		// animate multiple keypaths
		if ( typeof keypath === 'object' ) {
			options = to || {};
			animations = [];

			for ( k in keypath ) {
				if ( hasOwn.call( keypath, k ) ) {
					animations[ animations.length ] = animate( this, k, keypath[k], options );
				}
			}

			return {
				stop: function () {
					while ( animations.length ) {
						animations.pop().stop();
					}
				}
			};
		}

		// animate a single keypath
		options = options || {};

		animation = animate( this, keypath, to, options );

		return {
			stop: function () {
				animation.stop();
			}
		};
	};

	noAnimation = {
		stop: noop
	};

	animate = function ( root, keypath, to, options ) {
		var easing, duration, animation, i, from;

		from = root.get( keypath );
		
		// cancel any existing animation
		// TODO what about upstream/downstream keypaths?
		i = animationCollection.animations.length;
		while ( i-- ) {
			animation = animationCollection.animations[i];

			if ( animation.root === root && animation.keypath === keypath ) {
				animation.stop();
			}
		}

		// don't bother animating values that stay the same
		if ( isEqual( from, to ) ) {
			if ( options.complete ) {
				options.complete( 1, options.to );
			}

			return noAnimation;
		}

		// easing function
		if ( options.easing ) {
			if ( typeof options.easing === 'function' ) {
				easing = options.easing;
			}

			else {
				if ( root.easing && root.easing[ options.easing ] ) {
					// use instance easing function first
					easing = root.easing[ options.easing ];
				} else {
					// fallback to global easing functions
					easing = Ractive.easing[ options.easing ];
				}
			}

			if ( typeof easing !== 'function' ) {
				easing = null;
			}
		}

		// duration
		duration = ( options.duration === undefined ? 400 : options.duration );

		// TODO store keys, use an internal set method
		//keys = splitKeypath( keypath );

		animation = new Animation({
			keypath: keypath,
			from: from,
			to: to,
			root: root,
			duration: duration,
			easing: easing,
			step: options.step,
			complete: options.complete
		});

		animationCollection.push( animation );
		root._animations[ root._animations.length ] = animation;

		return animation;
	};

}( proto ));
proto.bind = function ( adaptor ) {
	var bound = this._bound;

	if ( bound.indexOf( adaptor ) === -1 ) {
		bound[ bound.length ] = adaptor;
		adaptor.init( this );
	}
};
proto.cancelFullscreen = function () {
	Ractive.cancelFullscreen( this.el );
};
proto.find = function ( selector ) {
	if ( !this.el ) {
		return null;
	}

	return this.el.querySelector( selector );
};
proto.findAll = function ( selector ) {
	if ( !this.el ) {
		return [];
	}

	return this.el.querySelectorAll( selector );
};
proto.fire = function ( eventName ) {
	var args, i, len, subscribers = this._subs[ eventName ];

	if ( !subscribers ) {
		return;
	}

	args = Array.prototype.slice.call( arguments, 1 );

	for ( i=0, len=subscribers.length; i<len; i+=1 ) {
		subscribers[i].apply( this, args );
	}
};
// TODO use dontNormalise
// TODO refactor this shitball

(function ( proto ) {

	var wrapProperty;

	proto.get = function ( keypath ) {
		var cache, cacheMap, keys, normalised, key, parentKeypath, parentValue, value, ignoreUndefined;

		if ( !keypath ) {
			return this.data;
		}

		cache = this._cache;

		if ( isArray( keypath ) ) {
			if ( !keypath.length ) {
				return this.data;
			}

			keys = keypath.slice(); // clone
			normalised = keys.join( '.' );

			ignoreUndefined = true; // because this should be a branch, sod the cache
		}

		else {
			// cache hit? great
			if ( hasOwn.call( cache, keypath ) && cache[ keypath ] !== UNSET ) {
				return cache[ keypath ];
			}

			keys = splitKeypath( keypath );
			normalised = keys.join( '.' );
		}

		// we may have a cache hit now that it's been normalised
		if ( hasOwn.call( cache, normalised ) && cache[ normalised ] !== UNSET ) {
			if ( cache[ normalised ] === undefined && ignoreUndefined ) {
				// continue
			} else {
				return cache[ normalised ];
			}
		}

		// is this an uncached evaluator value?
		if ( this._evaluators[ normalised ] ) {
			value = this._evaluators[ normalised ].value;
			cache[ normalised ] = value;
			return value;
		}

		// otherwise it looks like we need to do some work
		key = keys.pop();
		parentKeypath = keys.join( '.' );
		parentValue = ( keys.length ? this.get( keys ) : this.data );

		if ( parentValue === null || parentValue === undefined || parentValue === UNSET ) {
			return;
		}

		// if we're in magic mode, wrap values if necessary
		if ( this.magic && typeof parentValue === 'object' && hasOwn.call( parentValue, key ) ) {
			if ( !this._wrapped[ normalised ] ) {
				this._wrapped[ normalised ] = wrapProperty( parentValue, key, this, normalised );
			}
		}

		// update cache map
		if ( !( cacheMap = this._cacheMap[ parentKeypath ] ) ) {
			this._cacheMap[ parentKeypath ] = [ normalised ];
		} else {
			if ( cacheMap.indexOf( normalised ) === -1 ) {
				cacheMap[ cacheMap.length ] = normalised;
			}
		}

		value = parentValue[ key ];

		// Is this an array that needs to be wrapped?
		if ( this.modifyArrays ) {
			// if it's not an expression, is an array, and we're not here because it sent us here, wrap it
			if ( ( normalised.charAt( 0 ) !== '(' ) && isArray( value ) && ( !value._ractive || !value._ractive.setting ) ) {
				registerKeypathToArray( value, normalised, this );
			}
		}

		// Update cache
		cache[ normalised ] = value;

		return value;
	};


	// wrap object for magic get/set
	wrapProperty = function ( obj, prop, ractive, keypath ) {
		var value, descriptor, get, set, oldGet, oldSet;

		descriptor = Object.getOwnPropertyDescriptor( obj, prop );

		if ( descriptor ) {
			if ( descriptor.set && descriptor.set[ ractive._guid + keypath ] ) {
				return; // already wrapped
			}

			if ( !descriptor.configurable ) {
				throw new Error( 'Cannot configure property' );
			}
		}

		if ( !descriptor || hasOwn.call( descriptor, 'value' ) ) {
			if ( descriptor ) {
				value = descriptor.value;
			}
			
			get = function () {
				return value;
			};

			set = function ( newValue ) {
				value = newValue;

				if ( !ractive.muggleSet ) {
					ractive.magicSet = true;
					ractive.set( keypath, newValue );
					ractive.magicSet = false;
				}
			};

			// prevent rewrapping
			set[ ractive._guid + keypath ] = true;

			Object.defineProperty( obj, prop, { get: get, set: set, enumerable: true, configurable: true });
		}

		else {
			if ( ( descriptor.set && !descriptor.get ) || ( !descriptor.set && descriptor.get ) ) {
				throw new Error( 'Property with getter but no setter, or vice versa. I am confused.' );
			}

			if ( descriptor.set._ractive ) {
				return; // already wrapped
			}

			oldGet = descriptor.get;
			oldSet = descriptor.set;

			set = function ( newValue ) {
				oldSet( newValue );

				if ( !ractive.muggleSet ) {
					ractive.magicSet = true;
					ractive.set( keypath, oldGet() );
					ractive.magicSet = false;
				}
			};

			// prevent rewrapping
			set[ ractive._guid + keypath ] = true;

			Object.defineProperty( obj, prop, { get: oldGet, set: set, enumerable: true, configurable: true });
		}

		return {
			teardown: function () {
				Object.defineProperty( obj, prop, descriptor );
			}
		};
	};

}( proto ));
clearCache = function ( ractive, keypath ) {
	var value, cacheMap, childKeypath, wrappedProperty;

	// is this a modified array, which shouldn't fire set events on this keypath anymore?
	if ( ractive.modifyArrays ) {
		if ( keypath.charAt( 0 ) !== '(' ) { // expressions (and their children) don't get wrapped
			value = ractive._cache[ keypath ];
			if ( isArray( value ) && !value._ractive.setting ) {
				unregisterKeypathFromArray( value, keypath, ractive );
			}
		}
	}
	
	ractive._cache[ keypath ] = UNSET;

	if ( cacheMap = ractive._cacheMap[ keypath ] ) {
		while ( cacheMap.length ) {
			childKeypath = cacheMap.pop();

			clearCache( ractive, childKeypath );

			// unwrap properties
			wrappedProperty = ractive._wrapped[ childKeypath ];

			if ( wrappedProperty ) {
				wrappedProperty.teardown();
			}

			ractive._wrapped[ childKeypath ] = null;
		}
	}
};
notifyDependants = function ( ractive, keypath, onlyDirect ) {
	var i;

	for ( i=0; i<ractive._deps.length; i+=1 ) { // can't cache ractive._deps.length, it may change
		notifyDependantsByPriority( ractive, keypath, i, onlyDirect );
	}
};
notifyDependantsByPriority = function ( ractive, keypath, priority, onlyDirect ) {
	var depsByKeypath, deps, i, childDeps;

	depsByKeypath = ractive._deps[ priority ];

	if ( !depsByKeypath ) {
		return;
	}

	deps = depsByKeypath[ keypath ];

	if ( deps ) {
		i = deps.length;
		while ( i-- ) {
			deps[i].update();
		}
	}

	// If we're only notifying direct dependants, not dependants
	// of downstream keypaths, then YOU SHALL NOT PASS
	if ( onlyDirect ) {
		return;
	}
	

	// cascade
	childDeps = ractive._depsMap[ keypath ];
	
	if ( childDeps ) {
		i = childDeps.length;
		while ( i-- ) {
			notifyDependantsByPriority( ractive, childDeps[i], priority );
		}
	}
};
notifyMultipleDependants = function ( ractive, keypaths, onlyDirect ) {
	var  i, j, len;

	len = keypaths.length;

	for ( i=0; i<ractive._deps.length; i+=1 ) {
		if ( ractive._deps[i] ) {
			j = len;
			while ( j-- ) {
				notifyDependantsByPriority( ractive, keypaths[j], i, onlyDirect );
			}
		}
	}
};
processDeferredUpdates = function ( ractive ) {
	var evaluator, attribute;

	while ( ractive._defEvals.length ) {
		 evaluator = ractive._defEvals.pop();
		 evaluator.update().deferred = false;
	}

	while ( ractive._defAttrs.length ) {
		attribute = ractive._defAttrs.pop();
		attribute.update().deferred = false;
	}

	while ( ractive._defSelectValues.length ) {
		ractive._defSelectValues.pop().deferredUpdate();
	}
};
registerDependant = function ( dependant ) {
	var depsByKeypath, deps, keys, parentKeypath, map, ractive, keypath, priority;

	ractive = dependant.root;
	keypath = dependant.keypath;
	priority = dependant.priority;

	depsByKeypath = ractive._deps[ priority ] || ( ractive._deps[ priority ] = {} );
	deps = depsByKeypath[ keypath ] || ( depsByKeypath[ keypath ] = [] );

	deps[ deps.length ] = dependant;

	// update dependants map
	keys = splitKeypath( keypath );
	
	while ( keys.length ) {
		keys.pop();
		parentKeypath = keys.join( '.' );
	
		map = ractive._depsMap[ parentKeypath ] || ( ractive._depsMap[ parentKeypath ] = [] );

		if ( map[ keypath ] === undefined ) {
			map[ keypath ] = 0;
			map[ map.length ] = keypath;
		}

		map[ keypath ] += 1;

		keypath = parentKeypath;
	}
};
// Render instance to element specified here or at initialization
render = function ( ractive, options ) {
	var el, transitionManager;

	el = ( options.el ? getEl( options.el ) : ractive.el );

	// Clear the element, unless `append` is `true`
	if ( el && !options.append ) {
		el.innerHTML = '';
	}

	ractive._transitionManager = transitionManager = makeTransitionManager( ractive, options.complete );

	// Render our *root fragment*
	ractive.fragment = new DomFragment({
		descriptor: ractive.template,
		root: ractive,
		owner: ractive, // saves doing `if ( ractive.parent ) { /*...*/ }` later on
		parentNode: el
	});

	processDeferredUpdates( ractive );

	if ( el ) {
		el.appendChild( ractive.fragment.docFrag );
	}

	// transition manager has finished its work
	ractive._transitionManager = null;
	transitionManager.ready();
};
// Resolve a full keypath from `ref` within the given `contextStack` (e.g.
// `'bar.baz'` within the context stack `['foo']` might resolve to `'foo.bar.baz'`
resolveRef = function ( ractive, ref, contextStack ) {

	var keys, lastKey, innerMostContext, contextKeys, parentValue, keypath;

	// Implicit iterators - i.e. {{.}} - are a special case
	if ( ref === '.' ) {
		if ( !contextStack.length ) {
			return '';
		}

		return contextStack[ contextStack.length - 1 ];
	}

	// References prepended with '.' are another special case
	if ( ref.charAt( 0 ) === '.' ) {
		if ( !contextStack.length ) {
			return ref.substring( 1 );
		}
		
		return contextStack[ contextStack.length - 1 ] + ref;
	}

	keys = splitKeypath( ref );
	lastKey = keys.pop();

	// Clone the context stack, so we don't mutate the original
	contextStack = contextStack.concat();

	// Take each context from the stack, working backwards from the innermost context
	while ( contextStack.length ) {

		innerMostContext = contextStack.pop();
		contextKeys = splitKeypath( innerMostContext );

		parentValue = ractive.get( contextKeys.concat( keys ) );

		if ( typeof parentValue === 'object' && parentValue !== null && hasOwn.call( parentValue, lastKey ) ) {
			keypath = innerMostContext + '.' + ref;
			break;
		}
	}

	if ( !keypath && ractive.get( ref ) !== undefined ) {
		keypath = ref;
	}

	return keypath;
};
teardown = function ( thing ) {
	if ( !thing.keypath ) {
		// this was on the 'unresolved' list, we need to remove it
		var index = thing.root._pendingResolution.indexOf( thing );

		if ( index !== -1 ) {
			thing.root._pendingResolution.splice( index, 1 );
		}

	} else {
		// this was registered as a dependant
		unregisterDependant( thing );
	}
};
unregisterDependant = function ( dependant ) {
	var deps, keys, parentKeypath, map, ractive, keypath, priority;

	ractive = dependant.root;
	keypath = dependant.keypath;
	priority = dependant.priority;

	deps = ractive._deps[ priority ][ keypath ];
	deps.splice( deps.indexOf( dependant ), 1 );

	// update dependants map
	keys = splitKeypath( keypath );
	
	while ( keys.length ) {
		keys.pop();
		parentKeypath = keys.join( '.' );
	
		map = ractive._depsMap[ parentKeypath ];

		map[ keypath ] -= 1;

		if ( !map[ keypath ] ) {
			// remove from parent deps map
			map.splice( map.indexOf( keypath ), 1 );
			map[ keypath ] = undefined;
		}

		keypath = parentKeypath;
	}
};
proto.link = function ( keypath ) {
	var self = this;

	return function ( value ) {
		self.set( keypath, value );
	};
};
(function ( proto ) {

	var observe, Observer;

	proto.observe = function ( keypath, callback, options ) {

		var observers = [], k;

		if ( typeof keypath === 'object' ) {
			options = callback;

			for ( k in keypath ) {
				if ( hasOwn.call( keypath, k ) ) {
					callback = keypath[k];
					observers[ observers.length ] = observe( this, k, callback, options );
				}
			}

			return {
				cancel: function () {
					while ( observers.length ) {
						observers.pop().cancel();
					}
				}
			};
		}

		return observe( this, keypath, callback, options );
	};

	observe = function ( root, keypath, callback, options ) {
		var observer;

		observer = new Observer( root, keypath, callback, options );

		if ( !options || options.init !== false ) {
			observer.update( true );
		}

		registerDependant( observer );

		return {
			cancel: function () {
				unregisterDependant( observer );
			}
		};
	};

	Observer = function ( root, keypath, callback, options ) {
		this.root = root;
		this.keypath = keypath;
		this.callback = callback;
		this.priority = 0; // observers get top priority

		// default to root as context, but allow it to be overridden
		this.context = ( options && options.context ? options.context : root );
	};

	Observer.prototype = {
		update: function ( init ) {
			var value;

			// TODO create, and use, an internal get method instead - we can skip checks
			value = this.root.get( this.keypath, true );

			if ( !isEqual( value, this.value ) || init ) {
				// wrap the callback in a try-catch block, and only throw error in
				// debug mode
				try {
					this.callback.call( this.context, value, this.value );
				} catch ( err ) {
					if ( this.root.debug ) {
						throw err;
					}
				}
				this.value = value;
			}
		}
	};

}( proto ));


proto.off = function ( eventName, callback ) {
	var subscribers, index;

	// if no callback specified, remove all callbacks
	if ( !callback ) {
		// if no event name specified, remove all callbacks for all events
		if ( !eventName ) {
			this._subs = {};
		} else {
			this._subs[ eventName ] = [];
		}
	}

	subscribers = this._subs[ eventName ];

	if ( subscribers ) {
		index = subscribers.indexOf( callback );
		if ( index !== -1 ) {
			subscribers.splice( index, 1 );
		}
	}
};
proto.on = function ( eventName, callback ) {
	var self = this, listeners, n;

	// allow mutliple listeners to be bound in one go
	if ( typeof eventName === 'object' ) {
		listeners = [];

		for ( n in eventName ) {
			if ( hasOwn.call( eventName, n ) ) {
				listeners[ listeners.length ] = this.on( n, eventName[ n ] );
			}
		}

		return {
			cancel: function () {
				while ( listeners.length ) {
					listeners.pop().cancel();
				}
			}
		};
	}

	if ( !this._subs[ eventName ] ) {
		this._subs[ eventName ] = [ callback ];
	} else {
		this._subs[ eventName ].push( callback );
	}

	return {
		cancel: function () {
			self.off( eventName, callback );
		}
	};
};
proto.renderHTML = function () {
	return this.fragment.toString();
};
proto.requestFullscreen = function () {
	Ractive.requestFullscreen( this.el );
};
(function ( proto ) {

	var set, attemptKeypathResolution;

	proto.set = function ( keypath, value, complete ) {
		var notificationQueue, upstreamQueue, k, normalised, keys, previousTransitionManager, transitionManager;

		upstreamQueue = [ '' ]; // empty string will always be an upstream keypath
		notificationQueue = [];

		if ( isObject( keypath ) ) {
			complete = value;
		}

		// manage transitions
		previousTransitionManager = this._transitionManager;
		this._transitionManager = transitionManager = makeTransitionManager( this, complete );

		// setting multiple values in one go
		if ( isObject( keypath ) ) {
			for ( k in keypath ) {
				if ( hasOwn.call( keypath, k ) ) {
					keys = splitKeypath( k );
					normalised = keys.join( '.' );
					value = keypath[k];

					set( this, normalised, keys, value, notificationQueue, upstreamQueue );
				}
			}
		}

		// setting a single value
		else {
			keys = splitKeypath( keypath );
			normalised = keys.join( '.' );

			set( this, normalised, keys, value, notificationQueue, upstreamQueue );
		}

		// if anything has changed, attempt to resolve any unresolved keypaths...
		if ( notificationQueue.length && this._pendingResolution.length ) {
			attemptKeypathResolution( this );
		}

		// ...and notify dependants
		if ( upstreamQueue.length ) {
			notifyMultipleDependants( this, upstreamQueue, true );
		}

		if ( notificationQueue.length ) {
			notifyMultipleDependants( this, notificationQueue );
		}

		// Attributes don't reflect changes automatically if there is a possibility
		// that they will need to change again before the .set() cycle is complete
		// - they defer their updates until all values have been set
		processDeferredUpdates( this );

		// transition manager has finished its work
		this._transitionManager = previousTransitionManager;
		transitionManager.ready();

		// fire event
		if ( !this.setting ) {
			this.setting = true; // short-circuit any potential infinite loops
			
			if ( typeof keypath === 'object' ) {
				this.fire( 'set', keypath );
			} else {
				this.fire( 'set', keypath, value );
			}

			this.setting = false;
		}

		return this;
	};


	set = function ( root, keypath, keys, value, queue, upstreamQueue ) {
		var previous, key, obj, keysClone, accumulated, keypathToClear;

		keysClone = keys.slice();
		accumulated = [];

		previous = root.get( keypath );

		// update the model, if necessary
		if ( previous !== value ) {
			if ( !root.magicSet ) {
				root.muggleSet = true;

				// update data
				obj = root.data;
				while ( keys.length > 1 ) {
					key = accumulated[ accumulated.length ] = keys.shift();

					// If this branch doesn't exist yet, create a new one - if the next
					// key matches /^\s*[0-9]+\s*$/, assume we want an array branch rather
					// than an object
					if ( !obj[ key ] ) {
						
						// if we're creating a new branch, we may need to clear the upstream
						// keypath
						if ( !keypathToClear ) {
							keypathToClear = accumulated.join( '.' );
						}

						obj[ key ] = ( /^\s*[0-9]+\s*$/.test( keys[0] ) ? [] : {} );
					}

					obj = obj[ key ];
				}

				key = keys[0];

				obj[ key ] = value;

				root.muggleSet = false;
			}
		}

		else {
			// if value is a primitive, we don't need to do anything else
			if ( typeof value !== 'object' ) {
				return;
			}
		}


		// Clear cache
		clearCache( root, keypathToClear || keypath );

		// add this keypath to the notification queue
		queue[ queue.length ] = keypath;


		// add upstream keypaths to the upstream notification queue
		while ( keysClone.length > 1 ) {
			keysClone.pop();
			keypath = keysClone.join( '.' );

			if ( upstreamQueue.indexOf( keypath ) === -1 ) {
				upstreamQueue[ upstreamQueue.length ] = keypath;
			}
		}
		
	};

	attemptKeypathResolution = function ( root ) {
		var i, unresolved, keypath;

		// See if we can resolve any of the unresolved keypaths (if such there be)
		i = root._pendingResolution.length;
		while ( i-- ) { // Work backwards, so we don't go in circles!
			unresolved = root._pendingResolution.splice( i, 1 )[0];

			if ( keypath = resolveRef( root, unresolved.ref, unresolved.contextStack ) ) {
				// If we've resolved the keypath, we can initialise this item
				unresolved.resolve( keypath );

			} else {
				// If we can't resolve the reference, add to the back of
				// the queue (this is why we're working backwards)
				root._pendingResolution[ root._pendingResolution.length ] = unresolved;
			}
		}
	};

}( proto ));
// Teardown. This goes through the root fragment and all its children, removing observers
// and generally cleaning up after itself
proto.teardown = function ( complete ) {
	var keypath, transitionManager, previousTransitionManager;

	this.fire( 'teardown' );

	previousTransitionManager = this._transitionManager;
	this._transitionManager = transitionManager = makeTransitionManager( this, complete );

	this.fragment.teardown( true );

	// Cancel any animations in progress
	while ( this._animations[0] ) {
		this._animations[0].stop(); // it will remove itself from the index
	}

	// Clear cache - this has the side-effect of unregistering keypaths from modified arrays.
	for ( keypath in this._cache ) {
		clearCache( this, keypath );
	}

	// Teardown any bindings
	while ( this._bound.length ) {
		this.unbind( this._bound.pop() );
	}

	// transition manager has finished its work
	this._transitionManager = previousTransitionManager;
	transitionManager.ready();
};
proto.toggleFullscreen = function () {
	if ( Ractive.isFullscreen( this.el ) ) {
		this.cancelFullscreen();
	} else {
		this.requestFullscreen();
	}
};
proto.unbind = function ( adaptor ) {
	var bound = this._bound, index;

	index = bound.indexOf( adaptor );

	if ( index !== -1 ) {
		bound.splice( index, 1 );
		adaptor.teardown( this );
	}
};
proto.update = function ( keypath, complete ) {
	var transitionManager, previousTransitionManager;

	if ( typeof keypath === 'function' ) {
		complete = keypath;
	}

	// manage transitions
	previousTransitionManager = this._transitionManager;
	this._transitionManager = transitionManager = makeTransitionManager( this, complete );

	clearCache( this, keypath || '' );
	notifyDependants( this, keypath || '' );

	processDeferredUpdates( this );

	// transition manager has finished its work
	this._transitionManager = previousTransitionManager;
	transitionManager.ready();

	if ( typeof keypath === 'string' ) {
		this.fire( 'update', keypath );
	} else {
		this.fire( 'update' );
	}

	return this;
};
adaptors.backbone = function ( model, path ) {
	var settingModel, settingView, setModel, setView, pathMatcher, pathLength, prefix;

	if ( path ) {
		path += '.';
		pathMatcher = new RegExp( '^' + path.replace( /\./g, '\\.' ) );
		pathLength = path.length;
	}


	return {
		init: function ( view ) {
			
			// if no path specified...
			if ( !path ) {
				setView = function ( model ) {
					if ( !settingModel ) {
						settingView = true;
						view.set( model.changed );
						settingView = false;
					}
				};

				setModel = function ( keypath, value ) {
					if ( !settingView ) {
						settingModel = true;
						model.set( keypath, value );
						settingModel = false;
					}
				};
			}

			else {
				prefix = function ( attrs ) {
					var attr, result;

					result = {};

					for ( attr in attrs ) {
						if ( hasOwn.call( attrs, attr ) ) {
							result[ path + attr ] = attrs[ attr ];
						}
					}

					return result;
				};

				setView = function ( model ) {
					if ( !settingModel ) {
						settingView = true;
						view.set( prefix( model.changed ) );
						settingView = false;
					}
				};

				setModel = function ( keypath, value ) {
					if ( !settingView ) {
						if ( pathMatcher.test( keypath ) ) {
							settingModel = true;
							model.set( keypath.substring( pathLength ), value );
							settingModel = false;
						}
					}
				};
			}

			model.on( 'change', setView );
			view.on( 'set', setModel );
			
			// initialise
			view.set( path ? prefix( model.attributes ) : model.attributes );
		},

		teardown: function ( view ) {
			model.off( 'change', setView );
			view.off( 'set', setModel );
		}
	};
};
adaptors.backboneCollection = function ( collection, path ) {
	var settingCollection, settingView, setCollection, setView, pathMatcher, pathLength, prefix;

	if ( path ) {
		path += '.';
		pathMatcher = new RegExp( '^' + path.replace( /\./g, '\\.' ) );
		pathLength = path.length;
	}


	return {
		init: function ( view ) {

			// if no path specified...
			if ( !path ) {
				setView = function ( collection ) {
					if ( !settingCollection ) {
						settingView = true;
						view.set( collection.collection.toJSON() );
						settingView = false;
					}
				};

				setCollection = function ( keypath, value ) {
					if ( !settingView ) {
						settingCollection = true;
						collection.reset(value);
						settingCollection = false;
					}
				};
			}

			else {
				prefix = function ( models ) {
					var result, i;

					result = {};

					for ( i=0; i<models.length; i++ ) {
						result[ path + i ] = models[ i ];
					}

					return result;
				};

				setView = function ( collection ) {
					if ( typeof arguments[0] === 'string' ) {
						collection = arguments[1];
					}

					if ( !settingCollection ) {
						settingView = true;
						view.set( prefix( collection.collection.toJSON() ) );
						settingView = false;
					}
				};

				setCollection = function ( keypath, value ) {
					if ( !settingView ) {
						if ( pathMatcher.test( keypath ) ) {
							settingCollection = true;
							collection.reset(value);
							settingCollection = false;
						}
					}
				};
			}

			collection.on( 'all', setView );
			view.on( 'set', setCollection );

			// initialise
			view.set( path ? prefix( collection.toJSON() ) : collection.toJSON() );
		},

		teardown: function ( view ) {
			collection.off( 'change', setView );
			view.off( 'set', setCollection );
		}
	};
};
adaptors.statesman = function ( model, path ) {
	var settingModel, settingView, setModel, setView, pathMatcher, pathLength, prefix;

	if ( path ) {
		path += '.';
		pathMatcher = new RegExp( '^' + path.replace( /\./g, '\\.' ) );
		pathLength = path.length;

		prefix = function ( attrs ) {
			var attr, result;

			if ( !attrs ) {
				return;
			}

			result = {};

			for ( attr in attrs ) {
				if ( hasOwn.call( attrs, attr ) ) {
					result[ path + attr ] = attrs[ attr ];
				}
			}

			return result;
		};
	}


	return {
		init: function ( view ) {
			
			var data;

			// if no path specified...
			if ( !path ) {
				setView = function ( change ) {
					if ( !settingModel ) {
						settingView = true;
						
						view.set( change );
						
						settingView = false;
					}
				};

				if ( view.twoway ) {
					setModel = function ( keypath, value ) {
						if ( !settingView ) {
							settingModel = true;
							model.set( keypath, value );
							settingModel = false;
						}
					};
				}
			}

			else {
				setView = function ( change ) {
					if ( !settingModel ) {
						settingView = true;
						
						change = prefix( change );
						view.set( change );
						
						settingView = false;
					}
				};

				if ( view.twoway ) {
					setModel = function ( keypath, value ) {
						if ( !settingView ) {
							if ( pathMatcher.test( keypath ) ) {
								settingModel = true;
								model.set( keypath.substring( pathLength ), value );
								settingModel = false;
							}
						}
					};
				}
			}

			model.on( 'change', setView );
	
			if ( view.twoway ) {
				view.on( 'set', setModel );
			}
			
			// initialise
			data = ( path ? prefix( model.get() ) : model.get() );

			if ( data ) {
				view.set( path ? prefix( model.get() ) : model.get() );
			}
		},

		teardown: function ( view ) {
			model.off( 'change', setView );
			view.off( 'set', setModel );
		}
	};
};
// These are a subset of the easing equations found at
// https://raw.github.com/danro/easing-js - license info
// follows:

// --------------------------------------------------
// easing.js v0.5.4
// Generic set of easing functions with AMD support
// https://github.com/danro/easing-js
// This code may be freely distributed under the MIT license
// http://danro.mit-license.org/
// --------------------------------------------------
// All functions adapted from Thomas Fuchs & Jeremy Kahn
// Easing Equations (c) 2003 Robert Penner, BSD license
// https://raw.github.com/danro/easing-js/master/LICENSE
// --------------------------------------------------

// In that library, the functions named easeIn, easeOut, and
// easeInOut below are named easeInCubic, easeOutCubic, and
// (you guessed it) easeInOutCubic.
//
// You can add additional easing functions to this list, and they
// will be globally available.

easing = {
	linear: function ( pos ) { return pos; },
	easeIn: function ( pos ) { return Math.pow( pos, 3 ); },
	easeOut: function ( pos ) { return ( Math.pow( ( pos - 1 ), 3 ) + 1 ); },
	easeInOut: function ( pos ) {
		if ( ( pos /= 0.5 ) < 1 ) { return ( 0.5 * Math.pow( pos, 3 ) ); }
		return ( 0.5 * ( Math.pow( ( pos - 2 ), 3 ) + 2 ) );
	}
};
eventDefinitions.hover = function ( node, fire ) {
	var mouseoverHandler, mouseoutHandler;

	mouseoverHandler = function ( event ) {
		fire({
			node: node,
			original: event,
			hover: true
		});
	};

	mouseoutHandler = function ( event ) {
		fire({
			node: node,
			original: event,
			hover: false
		});
	};

	node.addEventListener( 'mouseover', mouseoverHandler, false );
	node.addEventListener( 'mouseout', mouseoutHandler, false );

	return {
		teardown: function () {
			node.removeEventListener( 'mouseover', mouseoverHandler, false );
			node.removeEventListener( 'mouseout', mouseoutHandler, false );
		}
	};
};
(function () {

	var makeKeyDefinition = function ( code ) {
		return function ( node, fire ) {
			var keydownHandler;

			node.addEventListener( 'keydown', keydownHandler = function ( event ) {
				var which = event.which || event.keyCode;

				if ( which === code ) {
					event.preventDefault();

					fire({
						node: node,
						original: event
					});
				}
			}, false );

			return {
				teardown: function () {
					node.removeEventListener( 'keydown', keydownHandler, false );
				}
			};
		};
	};

	eventDefinitions.enter = makeKeyDefinition( 13 );
	eventDefinitions.tab = makeKeyDefinition( 9 );
	eventDefinitions.escape = makeKeyDefinition( 27 );
	eventDefinitions.space = makeKeyDefinition( 32 );

}());
eventDefinitions.tap = function ( node, fire ) {
	var mousedown, touchstart, distanceThreshold, timeThreshold;

	distanceThreshold = 5; // maximum pixels pointer can move before cancel
	timeThreshold = 400;   // maximum milliseconds between down and up before cancel

	mousedown = function ( event ) {
		var currentTarget, x, y, up, move, cancel;

		if ( event.which != 1) {
			return;
		}

		x = event.clientX;
		y = event.clientY;
		currentTarget = this;

		up = function ( event ) {
			fire({
				node: currentTarget,
				original: event
			});

			cancel();
		};

		move = function ( event ) {
			if ( ( Math.abs( event.clientX - x ) >= distanceThreshold ) || ( Math.abs( event.clientY - y ) >= distanceThreshold ) ) {
				cancel();
			}
		};

		cancel = function () {
			node.removeEventListener( 'click', up, false );
			doc.removeEventListener( 'mousemove', move, false );
		};

		node.addEventListener( 'click', up, false );
		doc.addEventListener( 'mousemove', move, false );

		setTimeout( cancel, timeThreshold );
	};

	node.addEventListener( 'mousedown', mousedown, false );


	touchstart = function ( event ) {
		var currentTarget, x, y, touch, finger, move, up, cancel;

		if ( event.touches.length !== 1 ) {
			return;
		}

		touch = event.touches[0];

		x = touch.clientX;
		y = touch.clientY;
		currentTarget = this;

		finger = touch.identifier;

		up = function ( event ) {
			var touch;

			touch = event.changedTouches[0];
			if ( touch.identifier !== finger ) {
				cancel();
			}

			event.preventDefault();  // prevent compatibility mouse event
			fire({
				node: currentTarget,
				original: event
			});
			
			cancel();
		};

		move = function ( event ) {
			var touch;

			if ( event.touches.length !== 1 || event.touches[0].identifier !== finger ) {
				cancel();
			}

			touch = event.touches[0];
			if ( ( Math.abs( touch.clientX - x ) >= distanceThreshold ) || ( Math.abs( touch.clientY - y ) >= distanceThreshold ) ) {
				cancel();
			}
		};

		cancel = function () {
			node.removeEventListener( 'touchend', up, false );
			window.removeEventListener( 'touchmove', move, false );
			window.removeEventListener( 'touchcancel', cancel, false );
		};

		node.addEventListener( 'touchend', up, false );
		window.addEventListener( 'touchmove', move, false );
		window.addEventListener( 'touchcancel', cancel, false );

		setTimeout( cancel, timeThreshold );
	};

	node.addEventListener( 'touchstart', touchstart, false );


	return {
		teardown: function () {
			node.removeEventListener( 'mousedown', mousedown, false );
			node.removeEventListener( 'touchstart', touchstart, false );
		}
	};
};

(function () {

	var fillGaps,
		clone,
		augment,

		inheritFromParent,
		wrapMethod,
		inheritFromChildProps,
		conditionallyParseTemplate,
		extractInlinePartials,
		conditionallyParsePartials,
		initChildInstance,

		extendable,
		inheritable,
		blacklist;

	extend = function ( childProps ) {

		var Parent = this, Child;

		// create Child constructor
		Child = function ( options ) {
			initChildInstance( this, Child, options || {});
		};

		Child.prototype = create( Parent.prototype );

		// inherit options from parent, if we're extending a subclass
		if ( Parent !== Ractive ) {
			inheritFromParent( Child, Parent );
		}

		// apply childProps
		inheritFromChildProps( Child, childProps );

		// parse template and any partials that need it
		conditionallyParseTemplate( Child );
		extractInlinePartials( Child, childProps );
		conditionallyParsePartials( Child );
		
		Child.extend = Parent.extend;

		return Child;
	};

	extendable = [ 'data', 'partials', 'transitions', 'eventDefinitions', 'components' ];
	inheritable = [ 'el', 'template', 'complete', 'modifyArrays', 'twoway', 'lazy', 'append', 'preserveWhitespace', 'sanitize', 'noIntro', 'transitionsEnabled' ];
	blacklist = extendable.concat( inheritable );

	inheritFromParent = function ( Child, Parent ) {
		extendable.forEach( function ( property ) {
			if ( Parent[ property ] ) {
				Child[ property ] = clone( Parent[ property ] );
			}
		});

		inheritable.forEach( function ( property ) {
			if ( Parent[ property ] !== undefined ) {
				Child[ property ] = Parent[ property ];
			}
		});
	};

	wrapMethod = function ( method, superMethod ) {
		if ( /_super/.test( method ) ) {
			return function () {
				var _super = this._super, result;
				this._super = superMethod;

				result = method.apply( this, arguments );

				this._super = _super;
				return result;
			};
		}

		else {
			return method;
		}
	};

	inheritFromChildProps = function ( Child, childProps ) {
		var key, member;

		extendable.forEach( function ( property ) {
			var value = childProps[ property ];

			if ( value ) {
				if ( Child[ property ] ) {
					augment( Child[ property ], value );
				}

				else {
					Child[ property ] = value;
				}
			}
		});

		inheritable.forEach( function ( property ) {
			if ( childProps[ property ] !== undefined ) {
				Child[ property ] = childProps[ property ];
			}
		});

		// Blacklisted properties don't extend the child, as they are part of the initialisation options
		for ( key in childProps ) {
			if ( hasOwn.call( childProps, key ) && !hasOwn.call( Child.prototype, key ) && blacklist.indexOf( key ) === -1 ) {
				member = childProps[ key ];

				// if this is a method that overwrites a prototype method, we may need
				// to wrap it
				if ( typeof member === 'function' && typeof Child.prototype[ key ] === 'function' ) {
					Child.prototype[ key ] = wrapMethod( member, Child.prototype[ key ] );
				} else {
					Child.prototype[ key ] = member;
				}
			}
		}
	};

	conditionallyParseTemplate = function ( Child ) {
		var templateEl;

		if ( typeof Child.template === 'string' ) {
			if ( !Ractive.parse ) {
				throw new Error( missingParser );
			}

			if ( Child.template.charAt( 0 ) === '#' && doc ) {
				templateEl = doc.getElementById( Child.template.substring( 1 ) );
				if ( templateEl && templateEl.tagName === 'SCRIPT' ) {
					Child.template = Ractive.parse( templateEl.innerHTML, Child );
				} else {
					throw new Error( 'Could not find template element (' + Child.template + ')' );
				}
			} else {
				Child.template = Ractive.parse( Child.template, Child ); // all the relevant options are on Child
			}
		}
	};

	extractInlinePartials = function ( Child, childProps ) {
		// does our template contain inline partials?
		if ( isObject( Child.template ) ) {
			if ( !Child.partials ) {
				Child.partials = {};
			}

			// get those inline partials
			augment( Child.partials, Child.template.partials );

			// but we also need to ensure that any explicit partials override inline ones
			if ( childProps.partials ) {
				augment( Child.partials, childProps.partials );
			}

			// move template to where it belongs
			Child.template = Child.template.main;
		}
	};

	conditionallyParsePartials = function ( Child ) {
		var key, partial;

		// Parse partials, if necessary
		if ( Child.partials ) {
			for ( key in Child.partials ) {
				if ( hasOwn.call( Child.partials, key ) ) {
					if ( typeof Child.partials[ key ] === 'string' ) {
						if ( !Ractive.parse ) {
							throw new Error( missingParser );
						}

						partial = Ractive.parse( Child.partials[ key ], Child );
					} else {
						partial = Child.partials[ key ];
					}

					Child.partials[ key ] = partial;
				}
			}
		}
	};

	initChildInstance = function ( child, Child, options ) {
		
		// Add template to options, if necessary
		if ( !options.template && Child.template ) {
			options.template = Child.template;
		}

		extendable.forEach( function ( property ) {
			if ( !options[ property ] ) {
				if ( Child[ property ] ) {
					options[ property ] = clone( Child[ property ] );
				}
			} else {
				fillGaps( options[ property ], Child[ property ] );
			}
		});
		
		inheritable.forEach( function ( property ) {
			if ( options[ property ] === undefined && Child[ property ] !== undefined ) {
				options[ property ] = Child[ property ];
			}
		});

		if ( child.beforeInit ) {
			child.beforeInit.call( child, options );
		}

		Ractive.call( child, options );

		if ( child.init ) {
			child.init.call( child, options );
		}
	};

	fillGaps = function ( target, source ) {
		var key;

		for ( key in source ) {
			if ( hasOwn.call( source, key ) && !hasOwn.call( target, key ) ) {
				target[ key ] = source[ key ];
			}
		}
	};

	clone = function ( source ) {
		var target = {}, key;

		for ( key in source ) {
			if ( hasOwn.call( source, key ) ) {
				target[ key ] = source[ key ];
			}
		}

		return target;
	};

	augment = function ( target, source ) {
		var key;

		for ( key in source ) {
			if ( hasOwn.call( source, key ) ) {
				target[ key ] = source[ key ];
			}
		}
	};

}());
// TODO short circuit values that stay the same
interpolate = function ( from, to ) {
	if ( isNumeric( from ) && isNumeric( to ) ) {
		return Ractive.interpolators.number( +from, +to );
	}

	if ( isArray( from ) && isArray( to ) ) {
		return Ractive.interpolators.array( from, to );
	}

	if ( isObject( from ) && isObject( to ) ) {
		return Ractive.interpolators.object( from, to );
	}

	return function () { return to; };
};
interpolators = {
	number: function ( from, to ) {
		var delta = to - from;

		if ( !delta ) {
			return function () { return from; };
		}

		return function ( t ) {
			return from + ( t * delta );
		};
	},

	array: function ( from, to ) {
		var intermediate, interpolators, len, i;

		intermediate = [];
		interpolators = [];

		i = len = Math.min( from.length, to.length );
		while ( i-- ) {
			interpolators[i] = Ractive.interpolate( from[i], to[i] );
		}

		// surplus values - don't interpolate, but don't exclude them either
		for ( i=len; i<from.length; i+=1 ) {
			intermediate[i] = from[i];
		}

		for ( i=len; i<to.length; i+=1 ) {
			intermediate[i] = to[i];
		}

		return function ( t ) {
			var i = len;

			while ( i-- ) {
				intermediate[i] = interpolators[i]( t );
			}

			return intermediate;
		};
	},

	object: function ( from, to ) {
		var properties = [], len, interpolators, intermediate, prop;

		intermediate = {};
		interpolators = {};

		for ( prop in from ) {
			if ( hasOwn.call( from, prop ) ) {
				if ( hasOwn.call( to, prop ) ) {
					properties[ properties.length ] = prop;
					interpolators[ prop ] = Ractive.interpolate( from[ prop ], to[ prop ] );
				}

				else {
					intermediate[ prop ] = from[ prop ];
				}
			}
		}

		for ( prop in to ) {
			if ( hasOwn.call( to, prop ) && !hasOwn.call( from, prop ) ) {
				intermediate[ prop ] = to[ prop ];
			}
		}

		len = properties.length;

		return function ( t ) {
			var i = len, prop;

			while ( i-- ) {
				prop = properties[i];

				intermediate[ prop ] = interpolators[ prop ]( t );
			}

			return intermediate;
		};
	}
};
var defaultOptions = createFromNull();

defineProperties( defaultOptions, {
	preserveWhitespace: { enumerable: true, value: false },
	append:             { enumerable: true, value: false },
	twoway:             { enumerable: true, value: true  },
	modifyArrays:       { enumerable: true, value: true  },
	data:               { enumerable: true, value: {}    },
	lazy:               { enumerable: true, value: false },
	debug:              { enumerable: true, value: false },
	transitions:        { enumerable: true, value: {}    },
	eventDefinitions:   { enumerable: true, value: {}    },
	noIntro:            { enumerable: true, value: false },
	transitionsEnabled: { enumerable: true, value: true  },
	magic:              { enumerable: true, value: false }
});

Ractive = function ( options ) {

	var key, partial, i, template, templateEl, parsedTemplate;

	// Options
	// -------
	for ( key in defaultOptions ) {
		if ( !hasOwn.call( options, key ) ) {
			options[ key ] = ( typeof defaultOptions[ key ] === 'object' ? {} : defaultOptions[ key ] );
		}
	}


	// Initialization
	// --------------

	// We use Object.defineProperties (where possible) as these should be read-only
	defineProperties( this, {
		// Generate a unique identifier, for places where you'd use a weak map if it
		// existed
		_guid: {
			value: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
				var r, v;

				r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
				return v.toString(16);
			})
		},

		// events
		_subs: { value: createFromNull() },

		// cache
		_cache: { value: {} }, // we need to be able to use hasOwnProperty, so can't inherit from null
		_cacheMap: { value: createFromNull() },

		// dependency graph
		_deps: { value: [] },
		_depsMap: { value: createFromNull() },

		// unresolved dependants
		_pendingResolution: { value: [] },

		// Create arrays for deferred attributes and evaluators
		_defAttrs: { value: [] },
		_defEvals: { value: [] },
		_defSelectValues: { value: [] },

		// Keep a list of used evaluators, so we don't duplicate them
		_evaluators: { value: createFromNull() },

		// bindings
		_bound: { value: [] },

		// transition manager
		_transitionManager: { value: null, writable: true },

		// animations (so we can stop any in progress at teardown)
		_animations: { value: [] },

		// nodes registry
		nodes: { value: {} },

		// property wrappers
		_wrapped: { value: createFromNull() }
	});

	// options
	this.modifyArrays = options.modifyArrays;
	this.magic = options.magic;
	this.twoway = options.twoway;
	this.lazy = options.lazy;
	this.debug = options.debug;

	if ( this.magic && noMagic ) {
		throw new Error( 'Getters and setters (magic mode) are not supported in this browser' );
	}

	if ( options.el ) {
		this.el = getEl( options.el );
		if ( !this.el && this.debug ) {
			throw new Error( 'Could not find container element' );
		}
	}

	// shallow clone data
	this.data = {};
	for ( key in options.data ) {
		if ( hasOwn.call( options.data, key ) ) {
			this.data[ key ] = options.data[ key ];
		}
	}
	

	// Partials registry
	this.partials = {};

	// Components registry
	this.components = options.components || {};

	// Transition registry
	this.transitions = options.transitions;

	// Instance-specific event definitions registry
	this.eventDefinitions = options.eventDefinitions;

	// Set up bindings
	if ( options.bindings ) {
		if ( isArray( options.bindings ) ) {
			for ( i=0; i<options.bindings.length; i+=1 ) {
				this.bind( options.bindings[i] );
			}
		} else {
			this.bind( options.bindings );
		}
	}


	// Parse template, if necessary
	template = options.template;

	if ( typeof template === 'string' ) {
		if ( !Ractive.parse ) {
			throw new Error( missingParser );
		}

		if ( template.charAt( 0 ) === '#' && doc ) {
			// assume this is an ID of a <script type='text/ractive'> tag
			templateEl = doc.getElementById( template.substring( 1 ) );
			if ( templateEl ) {
				parsedTemplate = Ractive.parse( templateEl.innerHTML, options );
			}

			else {
				throw new Error( 'Could not find template element (' + template + ')' );
			}
		}

		else {
			parsedTemplate = Ractive.parse( template, options );
		}
	} else {
		parsedTemplate = template;
	}

	// deal with compound template
	if ( isObject( parsedTemplate ) ) {
		this.partials = parsedTemplate.partials;
		parsedTemplate = parsedTemplate.main;
	}

	// If the template was an array with a single string member, that means
	// we can use innerHTML - we just need to unpack it
	if ( parsedTemplate && ( parsedTemplate.length === 1 ) && ( typeof parsedTemplate[0] === 'string' ) ) {
		parsedTemplate = parsedTemplate[0];
	}

	this.template = parsedTemplate;


	// If we were given unparsed partials, parse them
	if ( options.partials ) {
		for ( key in options.partials ) {
			if ( hasOwn.call( options.partials, key ) ) {
				partial = options.partials[ key ];

				if ( typeof partial === 'string' ) {
					if ( !Ractive.parse ) {
						throw new Error( missingParser );
					}

					partial = Ractive.parse( partial, options );
				}

				this.partials[ key ] = partial;
			}
		}
	}

	// Unpack string-based partials, if necessary
	for ( key in this.partials ) {
		if ( hasOwn.call( this.partials, key ) && this.partials[ key ].length === 1 && typeof this.partials[ key ][0] === 'string' ) {
			this.partials[ key ] = this.partials[ key ][0];
		}
	}

	// temporarily disable transitions, if noIntro flag is set
	this.transitionsEnabled = ( options.noIntro ? false : options.transitionsEnabled );

	render( this, { el: this.el, append: options.append, complete: options.complete });

	// reset transitionsEnabled
	this.transitionsEnabled = options.transitionsEnabled;
};

(function () {

	var getOriginalComputedStyles, setStyle, augment, makeTransition;

	// no point executing this code on the server
	if ( !doc ) {
		return;
	}

	getOriginalComputedStyles = function ( computedStyle, properties ) {
		var original = {}, i;

		i = properties.length;
		while ( i-- ) {
			original[ properties[i] ] = computedStyle[ properties[i] ];
		}

		return original;
	};

	setStyle = function ( node, properties, map, params ) {
		var i = properties.length, prop;

		while ( i-- ) {
			prop = properties[i];
			if ( map && map[ prop ] ) {
				if ( typeof map[ prop ] === 'function' ) {
					node.style[ prop ] = map[ prop ]( params );
				} else {
					node.style[ prop ] = map[ prop ];
				}
			}

			else {
				node.style[ prop ] = 0;
			}
		}
	};

	augment = function ( target, source ) {
		var key;

		if ( !source ) {
			return target;
		}

		for ( key in source ) {
			if ( hasOwn.call( source, key ) ) {
				target[ key ] = source[ key ];
			}
		}

		return target;
	};

	if ( cssTransitionsEnabled ) {
		makeTransition = function ( properties, defaults, outside, inside ) {
			if ( typeof properties === 'string' ) {
				properties = [ properties ];
			}

			return function ( node, complete, params, isIntro ) {
				var transitionEndHandler,
					computedStyle,
					originalComputedStyles,
					startTransition,
					originalStyle,
					duration,
					delay,
					start,
					end,
					positionStyle,
					visibilityStyle;

				params = parseTransitionParams( params );
				
				duration = params.duration || defaults.duration;
				easing = hyphenate( params.easing || defaults.easing );
				delay = params.delay || 0;

				start = ( isIntro ? outside : inside );
				end = ( isIntro ? inside : outside );

				computedStyle = window.getComputedStyle( node );
				originalStyle = node.getAttribute( 'style' );

				// if this is an intro, we need to transition TO the original styles
				if ( isIntro ) {
					// hide, to avoid flashes
					positionStyle = node.style.position;
					visibilityStyle = node.style.visibility;
					node.style.position = 'absolute';
					node.style.visibility = 'hidden';

					// we need to wait a beat before we can actually get values from computedStyle.
					// Yeah, I know, WTF browsers
					setTimeout( function () {
						originalComputedStyles = getOriginalComputedStyles( computedStyle, properties );
						
						start = outside;
						end = augment( originalComputedStyles, inside );

						// starting style
						node.style.position = positionStyle;
						node.style.visibility = visibilityStyle;
						
						setStyle( node, properties, start, params );

						setTimeout( startTransition, 0 );
					}, delay );
				}

				// otherwise we need to transition FROM them
				else {
					setTimeout( function () {
						originalComputedStyles = getOriginalComputedStyles( computedStyle, properties );

						start = augment( originalComputedStyles, inside );
						end = outside;

						// ending style
						setStyle( node, properties, start, params );

						setTimeout( startTransition, 0 );
					}, delay );
				}

				startTransition = function () {
					node.style[ transition + 'Duration' ] = ( duration / 1000 ) + 's';
					node.style[ transition + 'Properties' ] = properties.map( hyphenate ).join( ',' );
					node.style[ transition + 'TimingFunction' ] = easing;

					transitionEndHandler = function () {
						node.removeEventListener( transitionend, transitionEndHandler, false );

						if ( isIntro ) {
							node.setAttribute( 'style', originalStyle || '' );
						}

						complete();
					};
					
					node.addEventListener( transitionend, transitionEndHandler, false );

					setStyle( node, properties, end, params );
				};
			};
		};

		transitions.slide = makeTransition([
			'height',
			'borderTopWidth',
			'borderBottomWidth',
			'paddingTop',
			'paddingBottom',
			'overflowY'
		], { duration: 400, easing: 'easeInOut' }, { overflowY: 'hidden' }, { overflowY: 'hidden' });

		transitions.fade = makeTransition( 'opacity', {
			duration: 300,
			easing: 'linear'
		});

		transitions.fly = makeTransition([ 'opacity', 'left', 'position' ], {
			duration: 400, easing: 'easeOut'
		}, { position: 'relative', left: '-500px' }, { position: 'relative', left: 0 });
	}

	

}());
var parseTransitionParams = function ( params ) {
	if ( params === 'fast' ) {
		return { duration: 200 };
	}

	if ( params === 'slow' ) {
		return { duration: 600 };
	}

	if ( isNumeric( params ) ) {
		return { duration: +params };
	}

	return params || {};
};
(function ( transitions ) {

	var typewriter, typewriteNode, typewriteTextNode;

	if ( !doc ) {
		return;
	}

	typewriteNode = function ( node, complete, interval ) {
		var children, next;

		if ( node.nodeType === 1 ) {
			node.style.display = node._display;
		}

		if ( node.nodeType === 3 ) {
			typewriteTextNode( node, complete, interval );
			return;
		}

		children = Array.prototype.slice.call( node.childNodes );

		next = function () {
			if ( !children.length ) {
				if ( node.nodeType === 1 ) {
					node.setAttribute( 'style', node._style || '' );
				}

				complete();
				return;
			}

			typewriteNode( children.shift(), next, interval );
		};

		next();
	};

	typewriteTextNode = function ( node, complete, interval ) {
		var str, len, loop, i;

		// text node
		str = node._hiddenData;
		len = str.length;

		if ( !len ) {
			complete();
			return;
		}

		i = 0;

		loop = setInterval( function () {
			var substr, remaining, match, remainingNonWhitespace, filler;

			substr = str.substr( 0, i );
			remaining = str.substring( i );

			match = /^\w+/.exec( remaining );
			remainingNonWhitespace = ( match ? match[0].length : 0 );

			// add some non-breaking whitespace corresponding to the remaining length of the
			// current word (only really works with monospace fonts, but better than nothing)
			filler = new Array( remainingNonWhitespace + 1 ).join( '\u00a0' );

			node.data = substr + filler;
			if ( i === len ) {
				clearInterval( loop );
				delete node._hiddenData;
				complete();
			}

			i += 1;
		}, interval );
	};

	// TODO differentiate between intro and outro
	typewriter = function ( node, complete, params ) {
		var interval, style, computedStyle, hide;

		params = parseTransitionParams( params );

		interval = params.interval || ( params.speed ? 1000 / params.speed : ( params.duration ? node.textContent.length / params.duration : 4 ) );
		
		style = node.getAttribute( 'style' );
		computedStyle = window.getComputedStyle( node );

		node.style.visibility = 'hidden';

		setTimeout( function () {
			var computedHeight, computedWidth, computedVisibility;

			computedWidth = computedStyle.width;
			computedHeight = computedStyle.height;
			computedVisibility = computedStyle.visibility;

			hide( node );

			setTimeout( function () {
				node.style.width = computedWidth;
				node.style.height = computedHeight;
				node.style.visibility = 'visible';

				typewriteNode( node, function () {
					node.setAttribute( 'style', style || '' );
					complete();
				}, interval );
			}, params.delay || 0 );
		});

		hide = function ( node ) {
			var children, i;

			if ( node.nodeType === 1 ) {
				node._style = node.getAttribute( 'style' );
				node._display = window.getComputedStyle( node ).display;

				node.style.display = 'none';
			}

			if ( node.nodeType === 3 ) {
				node._hiddenData = '' + node.data;
				node.data = '';
				
				return;
			}

			children = Array.prototype.slice.call( node.childNodes );
			i = children.length;
			while ( i-- ) {
				hide( children[i] );
			}
		};
	};

	transitions.typewriter = typewriter;

}( transitions ));
(function ( Ractive ) {

	var requestFullscreen, cancelFullscreen, fullscreenElement;

	if ( !doc ) {
		return;
	}

	Ractive.fullscreenEnabled = doc.fullscreenEnabled || doc.mozFullScreenEnabled || doc.webkitFullscreenEnabled;

	if ( !Ractive.fullscreenEnabled ) {
		Ractive.requestFullscreen = Ractive.cancelFullscreen = noop;
		return;
	}

	// get prefixed name of requestFullscreen method
	if ( testDiv.requestFullscreen ) {
		requestFullscreen = 'requestFullscreen';
	} else if ( testDiv.mozRequestFullScreen ) {
		requestFullscreen = 'mozRequestFullScreen';
	} else if ( testDiv.webkitRequestFullscreen ) {
		requestFullscreen = 'webkitRequestFullscreen';
	}

	Ractive.requestFullscreen = function ( el ) {
		if ( el[ requestFullscreen ] ) {
			el[ requestFullscreen ]();
		}
	};

	// get prefixed name of cancelFullscreen method
	if ( doc.cancelFullscreen ) {
		cancelFullscreen = 'cancelFullscreen';
	} else if ( doc.mozCancelFullScreen ) {
		cancelFullscreen = 'mozCancelFullScreen';
	} else if ( doc.webkitCancelFullScreen ) {
		cancelFullscreen = 'webkitCancelFullScreen';
	}

	Ractive.cancelFullscreen = function () {
		doc[ cancelFullscreen ]();
	};

	// get prefixed name of fullscreenElement property
	if ( doc.fullscreenElement !== undefined ) {
		fullscreenElement = 'fullscreenElement';
	} else if ( doc.mozFullScreenElement !== undefined ) {
		fullscreenElement = 'mozFullScreenElement';
	} else if ( doc.webkitFullscreenElement !== undefined ) {
		fullscreenElement = 'webkitFullscreenElement';
	}

	Ractive.isFullscreen = function ( el ) {
		return el === doc[ fullscreenElement ];
	};

}( Ractive ));
Animation = function ( options ) {
	var key;

	this.startTime = Date.now();

	// from and to
	for ( key in options ) {
		if ( hasOwn.call( options, key ) ) {
			this[ key ] = options[ key ];
		}
	}

	this.interpolator = Ractive.interpolate( this.from, this.to );
	this.running = true;
};

Animation.prototype = {
	tick: function () {
		var elapsed, t, value, timeNow, index;

		if ( this.running ) {
			timeNow = Date.now();
			elapsed = timeNow - this.startTime;

			if ( elapsed >= this.duration ) {
				this.root.set( this.keypath, this.to );

				if ( this.step ) {
					this.step( 1, this.to );
				}

				if ( this.complete ) {
					this.complete( 1, this.to );
				}

				index = this.root._animations.indexOf( this );

				// TODO remove this check, once we're satisifed this never happens!
				if ( index === -1 && console && console.warn ) {
					console.warn( 'Animation was not found' );
				}

				this.root._animations.splice( index, 1 );

				this.running = false;
				return false;
			}

			t = this.easing ? this.easing ( elapsed / this.duration ) : ( elapsed / this.duration );
			value = this.interpolator( t );

			this.root.set( this.keypath, value );

			if ( this.step ) {
				this.step( t, value );
			}

			return true;
		}

		return false;
	},

	stop: function () {
		var index;

		this.running = false;

		index = this.root._animations.indexOf( this );

		// TODO remove this check, once we're satisifed this never happens!
		if ( index === -1 && console && console.warn ) {
			console.warn( 'Animation was not found' );
		}

		this.root._animations.splice( index, 1 );
	}
};
animationCollection = {
	animations: [],

	tick: function () {
		var i, animation;

		for ( i=0; i<this.animations.length; i+=1 ) {
			animation = this.animations[i];

			if ( !animation.tick() ) {
				// animation is complete, remove it from the stack, and decrement i so we don't miss one
				this.animations.splice( i--, 1 );
			}
		}

		if ( this.animations.length ) {
			requestAnimationFrame( this.boundTick );
		} else {
			this.running = false;
		}
	},

	// bind method to animationCollection
	boundTick: function () {
		animationCollection.tick();
	},

	push: function ( animation ) {
		this.animations[ this.animations.length ] = animation;

		if ( !this.running ) {
			this.running = true;
			this.tick();
		}
	}
};
// https://gist.github.com/paulirish/1579671
(function( vendors, lastTime, global ) {
	
	var x, setTimeout;

	if ( global.requestAnimationFrame ) {
		requestAnimationFrame = global.requestAnimationFrame;
		return;
	}

	for ( x = 0; x < vendors.length && !requestAnimationFrame; ++x ) {
		requestAnimationFrame = global[vendors[x]+'RequestAnimationFrame'];
	}

	if ( !requestAnimationFrame ) {
		setTimeout = global.setTimeout;

		requestAnimationFrame = function(callback) {
			var currTime, timeToCall, id;
			
			currTime = Date.now();
			timeToCall = Math.max( 0, 16 - (currTime - lastTime ) );
			id = setTimeout( function() { callback(currTime + timeToCall); }, timeToCall );
			
			lastTime = currTime + timeToCall;
			return id;
		};
	}
	
}( ['ms', 'moz', 'webkit', 'o'], 0, global ));
(function () {

	var notifyArrayDependants,

		wrapArray,
		unwrapArray,
		WrappedArrayProto,
		testObj,
		mutatorMethods;


	// Register a keypath to this array. When any of this array's mutator methods are called,
	// it will `set` that keypath on the given Ractive instance
	registerKeypathToArray = function ( array, keypath, root ) {
		var roots, keypathsByGuid, keypaths;

		// If this array hasn't been wrapped, we need to wrap it
		if ( !array._ractive ) {
			defineProperty( array, '_ractive', {
				value: {
					roots: [ root ], // there may be more than one Ractive instance depending on this
					keypathsByGuid: {}
				},
				configurable: true
			});

			array._ractive.keypathsByGuid[ root._guid ] = [ keypath ];

			wrapArray( array );
		}

		else {
			roots = array._ractive.roots;
			keypathsByGuid = array._ractive.keypathsByGuid;

			// Does this Ractive instance currently depend on this array?
			// If not, associate them
			if ( !keypathsByGuid[ root._guid ] ) {
				roots[ roots.length ] = root;
				keypathsByGuid[ root._guid ] = [];
			}

			keypaths = keypathsByGuid[ root._guid ];

			// If the current keypath isn't among them, add it
			if ( keypaths.indexOf( keypath ) === -1 ) {
				keypaths[ keypaths.length ] = keypath;
			}
		}
	};


	// Unregister keypath from array
	unregisterKeypathFromArray = function ( array, keypath, root ) {
		var roots, keypathsByGuid, keypaths, keypathIndex;

		if ( !array._ractive ) {
			throw new Error( 'Attempted to remove keypath from non-wrapped array. This error is unexpected - please send a bug report to @rich_harris' );
		}

		roots = array._ractive.roots;
		keypathsByGuid = array._ractive.keypathsByGuid;

		if ( !keypathsByGuid[ root._guid ] ) {
			throw new Error( 'Ractive instance was not listed as a dependent of this array. This error is unexpected - please send a bug report to @rich_harris' );
		}

		keypaths = keypathsByGuid[ root._guid ];
		keypathIndex = keypaths.indexOf( keypath );

		if ( keypathIndex === -1 ) {
			throw new Error( 'Attempted to unlink non-linked keypath from array. This error is unexpected - please send a bug report to @rich_harris' );
		}

		keypaths.splice( keypathIndex, 1 );

		if ( !keypaths.length ) {
			roots.splice( roots.indexOf( root ), 1 );
			keypathsByGuid[ root._guid ] = null;
		}

		if ( !roots.length ) {
			unwrapArray( array ); // It's good to clean up after ourselves
		}
	};


	notifyArrayDependants = function ( array, methodName, args ) {
		var processRoots,
			processRoot,
			processKeypaths,
			processKeypath,
			queueDependants,
			keypathsByGuid;

		keypathsByGuid = array._ractive.keypathsByGuid;

		processRoots = function ( roots ) {
			var i = roots.length;
			while ( i-- ) {
				processRoot( roots[i] );
			}
		};

		processRoot = function ( root ) {
			var previousTransitionManager = root._transitionManager, transitionManager;

			root._transitionManager = transitionManager = makeTransitionManager( root, noop );
			processKeypaths( root, keypathsByGuid[ root._guid ] );
			root._transitionManager = previousTransitionManager;

			transitionManager.ready();
		};

		processKeypaths = function ( root, keypaths ) {
			var i = keypaths.length;
			while ( i-- ) {
				processKeypath( root, keypaths[i] );
			}
		};

		processKeypath = function ( root, keypath ) {
			var depsByKeypath, deps, keys, upstreamQueue, smartUpdateQueue, dumbUpdateQueue, i;

			// If this is a sort or reverse, we just do root.set()...
			if ( methodName === 'sort' || methodName === 'reverse' ) {
				root.set( keypath, array );
				return;
			}

			// otherwise we do a smart update whereby elements are added/removed
			// in the right place. But we do need to clear the cache
			clearCache( root, keypath );

			// find dependants. If any are DOM sections, we do a smart update
			// rather than a ractive.set() blunderbuss
			smartUpdateQueue = [];
			dumbUpdateQueue = [];

			for ( i=0; i<root._deps.length; i+=1 ) { // we can't cache root._deps.length as it may change!
				depsByKeypath = root._deps[i];

				if ( !depsByKeypath ) {
					continue;
				}

				deps = depsByKeypath[ keypath ];
				
				if ( deps ) {
					queueDependants( root, keypath, deps, smartUpdateQueue, dumbUpdateQueue );

					// we may have some deferred evaluators to process
					processDeferredUpdates( root );
					
					while ( smartUpdateQueue.length ) {
						smartUpdateQueue.pop().smartUpdate( methodName, args );
					}

					while ( dumbUpdateQueue.length ) {
						dumbUpdateQueue.pop().update();
					}
				}
			}

			// we may have some deferred attributes to process
			processDeferredUpdates( root );

			// Finally, notify direct dependants of upstream keypaths...
			upstreamQueue = [];

			keys = splitKeypath( keypath );
			while ( keys.length ) {
				keys.pop();
				upstreamQueue[ upstreamQueue.length ] = keys.join( '.' );
			}

			notifyMultipleDependants( root, upstreamQueue, true );

			// length property has changed - notify dependants
			// TODO in some cases (e.g. todo list example, when marking all as complete, then
			// adding a new item (which should deactivate the 'all complete' checkbox
			// but doesn't) this needs to happen before other updates. But doing so causes
			// other mental problems. not sure what's going on...
			notifyDependants( root, keypath + '.length', true );
		};

		// TODO can we get rid of this whole queueing nonsense?
		queueDependants = function ( root, keypath, deps, smartUpdateQueue, dumbUpdateQueue ) {
			var k, dependant;

			k = deps.length;
			while ( k-- ) {
				dependant = deps[k];

				// references need to get processed before mustaches
				if ( dependant.type === REFERENCE ) {
					dependant.update();
					//dumbUpdateQueue[ dumbUpdateQueue.length ] = dependant;
				}

				// is this a DOM section?
				else if ( dependant.keypath === keypath && dependant.type === SECTION /*&& dependant.parentNode*/ ) {
					smartUpdateQueue[ smartUpdateQueue.length ] = dependant;

				} else {
					dumbUpdateQueue[ dumbUpdateQueue.length ] = dependant;
				}
			}
		};

		processRoots( array._ractive.roots );
	};





		
	WrappedArrayProto = [];
	mutatorMethods = [ 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift' ];

	mutatorMethods.forEach( function ( methodName ) {
		var method = function () {
			var result = Array.prototype[ methodName ].apply( this, arguments );

			this._ractive.setting = true;
			notifyArrayDependants( this, methodName, arguments );
			this._ractive.setting = false;

			return result;
		};

		defineProperty( WrappedArrayProto, methodName, {
			value: method
		});
	});

	
	// can we use prototype chain injection?
	// http://perfectionkills.com/how-ecmascript-5-still-does-not-allow-to-subclass-an-array/#wrappers_prototype_chain_injection
	testObj = {};
	if ( testObj.__proto__ ) {
		// yes, we can
		wrapArray = function ( array ) {
			array.__proto__ = WrappedArrayProto;
		};

		unwrapArray = function ( array ) {
			delete array._ractive;
			array.__proto__ = Array.prototype;
		};
	}

	else {
		// no, we can't
		wrapArray = function ( array ) {
			var i, methodName;

			i = mutatorMethods.length;
			while ( i-- ) {
				methodName = mutatorMethods[i];
				defineProperty( array, methodName, {
					value: WrappedArrayProto[ methodName ],
					configurable: true
				});
			}
		};

		unwrapArray = function ( array ) {
			var i;

			i = mutatorMethods.length;
			while ( i-- ) {
				delete array[ mutatorMethods[i] ];
			}

			delete array._ractive;
		};
	}

}());
(function () {

	var propertyNames, determineNameAndNamespace, setStaticAttribute, determinePropertyName;

	// the property name equivalents for element attributes, where they differ
	// from the lowercased attribute name
	propertyNames = {
		'accept-charset': 'acceptCharset',
		accesskey: 'accessKey',
		bgcolor: 'bgColor',
		'class': 'className',
		codebase: 'codeBase',
		colspan: 'colSpan',
		contenteditable: 'contentEditable',
		datetime: 'dateTime',
		dirname: 'dirName',
		'for': 'htmlFor',
		'http-equiv': 'httpEquiv',
		ismap: 'isMap',
		maxlength: 'maxLength',
		novalidate: 'noValidate',
		pubdate: 'pubDate',
		readonly: 'readOnly',
		rowspan: 'rowSpan',
		tabindex: 'tabIndex',
		usemap: 'useMap'
	};

	// Attribute
	DomAttribute = function ( options ) {

		this.element = options.element;
		determineNameAndNamespace( this, options.name );

		// if it's an empty attribute, or just a straight key-value pair, with no
		// mustache shenanigans, set the attribute accordingly and go home
		if ( options.value === null || typeof options.value === 'string' ) {
			setStaticAttribute( this, options );
			return;
		}

		// otherwise we need to do some work
		this.root = options.root;
		this.parentNode = options.parentNode;

		// share parentFragment with parent element
		this.parentFragment = this.element.parentFragment;

		this.fragment = new StringFragment({
			descriptor:   options.value,
			root:         this.root,
			owner:        this,
			contextStack: options.contextStack
		});


		// if we're not rendering (i.e. we're just stringifying), we can stop here
		if ( !this.parentNode ) {
			return;
		}

		// special cases
		if ( this.name === 'value' ) {
			
			// in some cases we will need to store the node's intended value, as node.value
			// is always a string. For that, we need to add a place to store it
			options.element.ractify();

			this.isValueAttribute = true;

			// TODO need to wait until afterwards to determine type, in case we
			// haven't initialised that attribute yet
			// <input type='file' value='{{value}}'>
			if ( this.parentNode.tagName === 'INPUT' && this.parentNode.type === 'file' ) {
				this.isFileInputValue = true;
			}
		} 
		

		// can we establish this attribute's property name equivalent?
		determinePropertyName( this, options );
		
		// determine whether this attribute can be marked as self-updating
		this.selfUpdating = isStringFragmentSimple( this.fragment );

		// mark as ready
		this.ready = true;
	};

	DomAttribute.prototype = {
		bind: bindAttribute,
		update: updateAttribute,

		updateBindings: function () {
			// if the fragment this attribute belongs to gets reassigned (as a result of
			// as section being updated via an array shift, unshift or splice), this
			// attribute needs to recognise that its keypath has changed
			this.keypath = this.interpolator.keypath || this.interpolator.r; // TODO is this right? .r?

			// if we encounter the special case described above, update the name attribute
			if ( this.propertyName === 'name' ) {
				// replace actual name attribute
				this.parentNode.name = '{{' + this.keypath + '}}';
			}
		},

		teardown: function () {
			var i;

			if ( this.boundEvents ) {
				i = this.boundEvents.length;

				while ( i-- ) {
					this.parentNode.removeEventListener( this.boundEvents[i], this.updateModel, false );
				}
			}

			// ignore non-dynamic attributes
			if ( this.fragment ) {
				this.fragment.teardown();
			}
		},

		bubble: function () {
			// If an attribute's text fragment contains a single item, we can
			// update the DOM immediately...
			if ( this.selfUpdating ) {
				this.update();
			}

			// otherwise we want to register it as a deferred attribute, to be
			// updated once all the information is in, to prevent unnecessary
			// DOM manipulation
			else if ( !this.deferred && this.ready ) {
				this.root._defAttrs[ this.root._defAttrs.length ] = this;
				this.deferred = true;
			}
		},

		toString: function () {
			var str;

			if ( this.value === null ) {
				return this.name;
			}

			// TODO don't use JSON.stringify?

			if ( !this.fragment ) {
				return this.name + '=' + JSON.stringify( this.value );
			}

			// TODO deal with boolean attributes correctly
			str = this.fragment.toString();
			
			return this.name + '=' + JSON.stringify( str );
		}
	};


	// Helper functions
	determineNameAndNamespace = function ( attribute, name ) {
		var colonIndex, namespacePrefix;

		// are we dealing with a namespaced attribute, e.g. xlink:href?
		colonIndex = name.indexOf( ':' );
		if ( colonIndex !== -1 ) {

			// looks like we are, yes...
			namespacePrefix = name.substr( 0, colonIndex );

			// ...unless it's a namespace *declaration*, which we ignore (on the assumption
			// that only valid namespaces will be used)
			if ( namespacePrefix !== 'xmlns' ) {
				name = name.substring( colonIndex + 1 );

				attribute.name = name;
				attribute.namespace = namespaces[ namespacePrefix ];

				if ( !attribute.namespace ) {
					throw 'Unknown namespace ("' + namespacePrefix + '")';
				}

				return;
			}
		}

		attribute.name = name;
	};

	setStaticAttribute = function ( attribute, options ) {
		if ( options.parentNode ) {
			if ( attribute.namespace ) {
				options.parentNode.setAttributeNS( attribute.namespace, options.name, options.value );
			} else {
				options.parentNode.setAttribute( options.name, options.value );
			}

			if ( attribute.name === 'id' ) {
				options.root.nodes[ options.value ] = options.parentNode;
			}

			if ( attribute.name === 'value' ) {
				attribute.element.ractify().value = options.value;
			}
		}

		attribute.value = options.value;
	};

	determinePropertyName = function ( attribute, options ) {
		var propertyName;

		if ( attribute.parentNode && !attribute.namespace && ( !options.parentNode.namespaceURI || options.parentNode.namespaceURI === namespaces.html ) ) {
			propertyName = propertyNames[ attribute.name ] || attribute.name;

			if ( options.parentNode[ propertyName ] !== undefined ) {
				attribute.propertyName = propertyName;
			}

			// is attribute a boolean attribute or 'value'? If so we're better off doing e.g.
			// node.selected = true rather than node.setAttribute( 'selected', '' )
			if ( typeof options.parentNode[ propertyName ] === 'boolean' || propertyName === 'value' ) {
				attribute.useProperty = true;
			}
		}
	};

}());
(function () {

	var ComponentParameter;

	// TODO support server environments
	DomComponent = function ( options ) {
		var self = this,
			parentFragment = this.parentFragment = options.parentFragment,
			root,
			Component,
			twoway,
			partials,
			instance,
			keypath,
			data,
			mappings,
			i,
			pair,
			observeParent,
			observeChild,
			settingParent,
			settingChild,
			key,
			initFalse,
			processKeyValuePair,
			eventName,
			propagateEvent;

		root = parentFragment.root;

		this.type = COMPONENT;
		this.name = options.descriptor.r;

		Component = getComponentConstructor( parentFragment.root, options.descriptor.e );
		twoway = ( Component.twoway !== false );

		data = {};
		mappings = [];

		this.complexParameters = [];

		processKeyValuePair = function ( key, value ) {
			var parameter;

			// if this is a static value, great
			if ( typeof value === 'string' ) {
				try {
					data[ key ] = JSON.parse( value );
				} catch ( err ) {
					data[ key ] = value;
				}
				return;
			}

			// if null, we treat is as a boolean attribute (i.e. true)
			if ( value === null ) {
				data[ key ] = true;
				return;
			}

			// if a regular interpolator, we bind to it
			if ( value.length === 1 && value[0].t === INTERPOLATOR && value[0].r ) {
				
				// is it an index reference?
				if ( parentFragment.indexRefs && parentFragment.indexRefs[ value[0].r ] !== undefined ) {
					data[ key ] = parentFragment.indexRefs[ value[0].r ];
					return;
				}

				keypath = resolveRef( root, value[0].r, parentFragment.contextStack ) || value[0].r;

				data[ key ] = root.get( keypath );
				mappings[ mappings.length ] = [ key, keypath ];
				return;
			}

			parameter = new ComponentParameter( root, self, key, value, parentFragment.contextStack );
			self.complexParameters[ self.complexParameters.length ] = parameter;

			data[ key ] = parameter.value;
		};

		if ( options.descriptor.a ) {
			for ( key in options.descriptor.a ) {
				if ( options.descriptor.a.hasOwnProperty( key ) ) {
					processKeyValuePair( key, options.descriptor.a[ key ] );
				}
			}
		}

		partials = {};
		if ( options.descriptor.f ) {
			partials.content = options.descriptor.f;
		}

		instance = this.instance = new Component({
			append: true,
			el: parentFragment.parentNode,
			data: data,
			partials: partials
		});

		self.observers = [];
		initFalse = { init: false };

		observeParent = function ( pair ) {
			var observer = root.observe( pair[1], function ( value ) {
				if ( !settingParent ) {
					settingChild = true;
					instance.set( pair[0], value );
					settingChild = false;
				}
			}, initFalse );

			self.observers[ self.observers.length ] = observer;
		};

		if ( twoway ) {
			observeChild = function ( pair ) {
				var observer = instance.observe( pair[0], function ( value ) {
					if ( !settingChild ) {
						settingParent = true;
						root.set( pair[1], value );
						settingParent = false;
					}
				}, initFalse );

				self.observers[ self.observers.length ] = observer;
			};
		}
		

		i = mappings.length;
		while ( i-- ) {
			pair = mappings[i];

			observeParent( pair );

			if ( twoway ) {
				observeChild( pair );
			}
		}


		// proxy events
		propagateEvent = function ( eventName, proxy ) {
			instance.on( eventName, function () {
				var args = Array.prototype.slice.call( arguments );
				args.unshift( proxy );

				root.fire.apply( root, args );
			});
		};

		if ( options.descriptor.v ) {
			for ( eventName in options.descriptor.v ) {
				if ( options.descriptor.v.hasOwnProperty( eventName ) ) {
					propagateEvent( eventName, options.descriptor.v[ eventName ] );
				}
			}
		}
	};

	DomComponent.prototype = {
		firstNode: function () {
			return this.instance.fragment.firstNode();
		},

		findNextNode: function () {
			return this.parentFragment.findNextNode( this );
		},

		teardown: function () {
			while ( this.complexParameters.length ) {
				this.complexParameters.pop().teardown();
			}

			while ( this.observers.length ) {
				this.observers.pop().cancel();
			}
			
			this.instance.teardown();
		},

		toString: function () {
			return this.instance.fragment.toString();
		}
	};


	ComponentParameter = function ( root, component, key, value, contextStack ) {
		
		this.parentFragment = component.parentFragment;
		this.component = component;
		this.key = key;

		this.fragment = new StringFragment({
			descriptor:   value,
			root:         root,
			owner:        this,
			contextStack: contextStack
		});

		this.selfUpdating = isStringFragmentSimple( this.fragment );
		this.value = this.fragment.getValue();
	};

	ComponentParameter.prototype = {
		bubble: function () {
			// If there's a single item, we can update the component immediately...
			if ( this.selfUpdating ) {
				this.update();
			}

			// otherwise we want to register it as a deferred component, to be
			// updated once all the information is in, to prevent unnecessary
			// DOM manipulation
			else if ( !this.deferred && this.ready ) {
				this.root._defAttrs[ this.root._defAttrs.length ] = this;
				this.deferred = true;
			}
		},

		update: function () {
			var value = this.fragment.getValue();

			this.component.set( this.key, value );
			this.value = value;
		}
	};


}());
// Element
DomElement = function ( options, docFrag ) {

	var parentFragment,
		descriptor,
		namespace,
		attributes,
		root;

	this.type = ELEMENT;

	// stuff we'll need later
	parentFragment = this.parentFragment = options.parentFragment;
	descriptor = this.descriptor = options.descriptor;

	this.root = root = parentFragment.root;
	this.parentNode = parentFragment.parentNode;
	this.index = options.index;

	this.eventListeners = [];
	this.customEventListeners = [];

	// get namespace, if we're actually rendering (not server-side stringifying)
	if ( this.parentNode ) {
		namespace = getElementNamespace( descriptor, this.parentNode );

		// create the DOM node
		this.node = doc.createElementNS( namespace, descriptor.e );
	}


	// append children, if there are any
	if ( descriptor.f ) {
		appendElementChildren( this, this.node, descriptor, docFrag );
	}


	// create event proxies
	if ( docFrag && descriptor.v ) {
		addEventProxies( this, descriptor.v );
	}

	// set attributes
	attributes = createElementAttributes( this, descriptor.a );


	// if we're actually rendering (i.e. not server-side stringifying), proceed
	if ( docFrag ) {
		// deal with two-way bindings
		if ( root.twoway ) {
			bindElement( this, attributes );
		}

		// name attributes are deferred, because they're a special case
		if ( attributes.name ) {
			attributes.name.update();
		}

		docFrag.appendChild( this.node );

		// trigger intro transition
		if ( descriptor.t1 ) {
			executeTransition( descriptor.t1, root, this, parentFragment.contextStack, true );
		}
	}
};

DomElement.prototype = {
	teardown: function ( detach ) {
		var eventName;

		// Children first. that way, any transitions on child elements will be
		// handled by the current transitionManager
		if ( this.fragment ) {
			this.fragment.teardown( false );
		}

		while ( this.attributes.length ) {
			this.attributes.pop().teardown();
		}

		if ( this.node._ractive ) {
			for ( eventName in this.node._ractive.events ) {
				this.node._ractive.events[ eventName ].teardown();
			}
		}

		if ( this.descriptor.t2 ) {
			executeTransition( this.descriptor.t2, this.root, this, this.parentFragment.contextStack, false );
		}

		if ( detach ) {
			this.root._transitionManager.detachWhenReady( this.node );
		}
	},

	firstNode: function () {
		return this.node;
	},

	findNextNode: function () {
		return null;
	},

	// TODO can we get rid of this?
	bubble: noop, // just so event proxy and transition fragments have something to call!

	toString: function () {
		var str, i, len;

		// TODO void tags
		str = '' +
			'<' + this.descriptor.e;

		len = this.attributes.length;
		for ( i=0; i<len; i+=1 ) {
			str += ' ' + this.attributes[i].toString();
		}

		str += '>';

		if ( this.html ) {
			str += this.html;
		} else if ( this.fragment ) {
			str += this.fragment.toString();
		}

		str += '</' + this.descriptor.e + '>';

		return str;
	},

	ractify: function () {
		var contextStack = this.parentFragment.contextStack;

		if ( !this.node._ractive ) {
			defineProperty( this.node, '_ractive', {
				value: {
					keypath: ( contextStack.length ? contextStack[ contextStack.length - 1 ] : '' ),
					index: this.parentFragment.indexRefs,
					events: createFromNull(),
					root: this.root
				}
			});
		}

		return this.node._ractive;
	}
};
DomFragment = function ( options ) {
	if ( options.parentNode ) {
		this.docFrag = doc.createDocumentFragment();
	}

	// if we have an HTML string, our job is easy.
	if ( typeof options.descriptor === 'string' ) {
		this.html = options.descriptor;

		if ( this.docFrag ) {
			this.nodes = insertHtml( options.descriptor, this.docFrag );
		}
		
		return; // prevent the rest of the init sequence
	}

	// otherwise we need to make a proper fragment
	initFragment( this, options );
};

DomFragment.prototype = {
	createItem: function ( options ) {
		if ( typeof options.descriptor === 'string' ) {
			return new DomText( options, this.docFrag );
		}

		switch ( options.descriptor.t ) {
			case INTERPOLATOR: return new DomInterpolator( options, this.docFrag );
			case SECTION:      return new DomSection( options, this.docFrag );
			case TRIPLE:       return new DomTriple( options, this.docFrag );

			case ELEMENT:      return new DomElement( options, this.docFrag );
			case PARTIAL:      return new DomPartial( options, this.docFrag );
			case COMPONENT:    return new DomComponent( options, this.docFrag );

			default: throw new Error( 'WTF? not sure what happened here...' );
		}
	},

	teardown: function ( detach ) {
		var node;

		// if this was built from HTML, we just need to remove the nodes
		if ( detach && this.nodes ) {
			while ( this.nodes.length ) {
				node = this.nodes.pop();
				node.parentNode.removeChild( node );
			}
			return;
		}

		// otherwise we need to do a proper teardown
		if ( !this.items ) {
			return;
		}

		while ( this.items.length ) {
			this.items.pop().teardown( detach );
		}
	},

	firstNode: function () {
		if ( this.items && this.items[0] ) {
			return this.items[0].firstNode();
		} else if ( this.nodes ) {
			return this.nodes[0] || null;
		}

		return null;
	},

	findNextNode: function ( item ) {
		var index = item.index;

		if ( this.items[ index + 1 ] ) {
			return this.items[ index + 1 ].firstNode();
		}

		// if this is the root fragment, and there are no more items,
		// it means we're at the end
		if ( this.owner === this.root ) {
			return null;
		}

		return this.owner.findNextNode( this );
	},

	toString: function () {
		var html, i, len, item;
		
		if ( this.html ) {
			return this.html;
		}

		html = '';

		if ( !this.items ) {
			return html;
		}

		len = this.items.length;

		for ( i=0; i<len; i+=1 ) {
			item = this.items[i];
			html += item.toString();
		}

		return html;
	}
};
// Interpolator
DomInterpolator = function ( options, docFrag ) {
	this.type = INTERPOLATOR;

	if ( docFrag ) {
		this.node = doc.createTextNode( '' );
		docFrag.appendChild( this.node );
	}

	// extend Mustache
	initMustache( this, options );
};

DomInterpolator.prototype = {
	update: updateMustache,
	resolve: resolveMustache,

	teardown: function ( detach ) {
		teardown( this );
		
		if ( detach ) {
			this.node.parentNode.removeChild( this.node );
		}
	},

	render: function ( value ) {
		if ( this.node ) {
			this.node.data = ( value === undefined ? '' : value );
		}
	},

	firstNode: function () {
		return this.node;
	},

	toString: function () {
		var value = ( this.value !== undefined ? '' + this.value : '' );
		return value.replace( '<', '&lt;' ).replace( '>', '&gt;' );
	}
};
// Partials
DomPartial = function ( options, docFrag ) {
	var parentFragment = this.parentFragment = options.parentFragment, descriptor;

	this.type = PARTIAL;
	this.name = options.descriptor.r;

	descriptor = getPartialDescriptor( parentFragment.root, options.descriptor.r );

	this.fragment = new DomFragment({
		descriptor:   descriptor,
		root:         parentFragment.root,
		parentNode:   parentFragment.parentNode,
		contextStack: parentFragment.contextStack,
		owner:        this
	});

	if ( docFrag ) {
		docFrag.appendChild( this.fragment.docFrag );
	}
};

DomPartial.prototype = {
	firstNode: function () {
		return this.fragment.firstNode();
	},

	findNextNode: function () {
		return this.parentFragment.findNextNode( this );
	},

	teardown: function ( detach ) {
		this.fragment.teardown( detach );
	},

	toString: function () {
		return this.fragment.toString();
	}
};
// Section
DomSection = function ( options, docFrag ) {
	this.type = SECTION;

	this.fragments = [];
	this.length = 0; // number of times this section is rendered

	if ( docFrag ) {
		this.docFrag = doc.createDocumentFragment();
	}
	
	this.initialising = true;
	initMustache( this, options );

	if ( docFrag ) {
		docFrag.appendChild( this.docFrag );
	}

	this.initialising = false;
};

DomSection.prototype = {
	update: updateMustache,
	resolve: resolveMustache,

	smartUpdate: function ( methodName, args ) {
		var fragmentOptions;

		if ( methodName === 'push' || methodName === 'unshift' || methodName === 'splice' ) {
			fragmentOptions = {
				descriptor: this.descriptor.f,
				root:       this.root,
				parentNode: this.parentNode,
				owner:      this
			};

			if ( this.descriptor.i ) {
				fragmentOptions.indexRef = this.descriptor.i;
			}
		}

		if ( this[ methodName ] ) { // if not, it's sort or reverse, which doesn't affect us (i.e. our length)
			this[ methodName ]( fragmentOptions, args );
		}
	},

	pop: function () {
		// teardown last fragment
		if ( this.length ) {
			this.fragments.pop().teardown( true );
			this.length -= 1;
		}
	},

	push: function ( fragmentOptions, args ) {
		var start, end, i;

		// append list item to context stack
		start = this.length;
		end = start + args.length;

		for ( i=start; i<end; i+=1 ) {
			fragmentOptions.contextStack = this.contextStack.concat( this.keypath + '.' + i );
			fragmentOptions.index = i;

			this.fragments[i] = this.createFragment( fragmentOptions );
		}
		
		this.length += args.length;

		// append docfrag in front of next node
		this.parentNode.insertBefore( this.docFrag, this.parentFragment.findNextNode( this ) );
	},

	shift: function () {
		this.splice( null, [ 0, 1 ] );
	},

	unshift: function ( fragmentOptions, args ) {
		this.splice( fragmentOptions, [ 0, 0 ].concat( new Array( args.length ) ) );
	},

	splice: function ( fragmentOptions, args ) {
		var insertionPoint, addedItems, removedItems, balance, i, start, end, spliceArgs, reassignStart;

		if ( !args.length ) {
			return;
		}

		// figure out where the changes started...
		start = +( args[0] < 0 ? this.length + args[0] : args[0] );

		// ...and how many items were added to or removed from the array
		addedItems = Math.max( 0, args.length - 2 );
		removedItems = ( args[1] !== undefined ? args[1] : this.length - start );

		balance = addedItems - removedItems;

		if ( !balance ) {
			// The array length hasn't changed - we don't need to add or remove anything
			return;
		}

		// If more items were removed than added, we need to remove some things from the DOM
		if ( balance < 0 ) {
			end = start - balance;

			for ( i=start; i<end; i+=1 ) {
				this.fragments[i].teardown( true );
			}

			// Keep in sync
			this.fragments.splice( start, -balance );
		}

		// Otherwise we need to add some things to the DOM
		else {
			end = start + balance;

			// Figure out where these new nodes need to be inserted
			insertionPoint = ( this.fragments[ start ] ? this.fragments[ start ].firstNode() : this.parentFragment.findNextNode( this ) );

			// Make room for the new fragments. (Just trust me, this works...)
			spliceArgs = [ start, 0 ].concat( new Array( balance ) );
			this.fragments.splice.apply( this.fragments, spliceArgs );

			for ( i=start; i<end; i+=1 ) {
				fragmentOptions.contextStack = this.contextStack.concat( this.keypath + '.' + i );
				fragmentOptions.index = i;

				this.fragments[i] = this.createFragment( fragmentOptions );
			}

			// Append docfrag in front of insertion point
			this.parentNode.insertBefore( this.docFrag, insertionPoint );
		}

		this.length += balance;


		// Now we need to reassign existing fragments (e.g. items.4 -> items.3 - the keypaths,
		// context stacks and index refs will have changed)
		reassignStart = ( start + addedItems );

		reassignFragments( this.root, this, reassignStart, this.length, balance );
	},

	teardown: function ( detach ) {
		this.teardownFragments( detach );

		teardown( this );
	},

	firstNode: function () {
		if ( this.fragments[0] ) {
			return this.fragments[0].firstNode();
		}

		return this.parentFragment.findNextNode( this );
	},

	findNextNode: function ( fragment ) {
		if ( this.fragments[ fragment.index + 1 ] ) {
			return this.fragments[ fragment.index + 1 ].firstNode();
		}

		return this.parentFragment.findNextNode( this );
	},

	teardownFragments: function ( detach ) {
		while ( this.fragments.length ) {
			this.fragments.shift().teardown( detach );
		}
	},

	render: function ( value ) {
		var next;

		// prevent sections from rendering multiple times (happens if
		// evaluators evaluate while update is happening)
		if ( this.rendering ) {
			return;
		}

		this.rendering = true;
		updateSection( this, value );
		this.rendering = false;

		// if we have no new nodes to insert (i.e. the section length stayed the
		// same, or shrank), we don't need to go any further
		if ( this.docFrag && !this.docFrag.childNodes.length ) {
			return;
		}

		// if this isn't the initial render, we need to insert any new nodes in
		// the right place
		if ( !this.initialising ) {
			
			// Normally this is just a case of finding the next node, and inserting
			// items before it...
			next = this.parentFragment.findNextNode( this );

			if ( next && ( next.parentNode === this.parentNode ) ) {
				this.parentNode.insertBefore( this.docFrag, next );
			}

			// ...but in some edge cases the next node will not have been attached to
			// the DOM yet, in which case we append to the end of the parent node
			else {
				// TODO could there be a situation in which later nodes could have
				// been attached to the parent node, i.e. we need to find a sibling
				// to insert before?
				this.parentNode.appendChild( this.docFrag );
			}
		}
	},

	createFragment: function ( options ) {
		var fragment = new DomFragment( options );
		
		if ( this.docFrag ) {
			this.docFrag.appendChild( fragment.docFrag );
		}

		return fragment;
	},

	toString: function () {
		var str, i, len;

		str = '';

		i = 0;
		len = this.length;

		for ( i=0; i<len; i+=1 ) {
			str += this.fragments[i].toString();
		}

		return str;
	}
};
// Plain text
DomText = function ( options, docFrag ) {
	this.type = TEXT;
	this.descriptor = options.descriptor;

	if ( docFrag ) {
		this.node = doc.createTextNode( options.descriptor );
		this.parentNode = options.parentFragment.parentNode;

		docFrag.appendChild( this.node );
	}
};

DomText.prototype = {
	teardown: function ( detach ) {
		if ( detach ) {
			this.node.parentNode.removeChild( this.node );
		}
	},

	firstNode: function () {
		return this.node;
	},

	toString: function () {
		return ( '' + this.descriptor ).replace( '<', '&lt;' ).replace( '>', '&gt;' );
	}
};
// Triple
DomTriple = function ( options, docFrag ) {
	this.type = TRIPLE;

	if ( docFrag ) {
		this.nodes = [];
		this.docFrag = doc.createDocumentFragment();
	}

	this.initialising = true;
	initMustache( this, options );
	if ( docFrag ) {
		docFrag.appendChild( this.docFrag );
	}
	this.initialising = false;
};

DomTriple.prototype = {
	update: updateMustache,
	resolve: resolveMustache,

	teardown: function ( detach ) {
		var node;

		// remove child nodes from DOM
		if ( detach ) {
			while ( this.nodes.length ) {
				node = this.nodes.pop();
				node.parentNode.removeChild( node );
			}
		}

		teardown( this );
	},

	firstNode: function () {
		if ( this.nodes[0] ) {
			return this.nodes[0];
		}

		return this.parentFragment.findNextNode( this );
	},

	render: function ( html ) {
		var node;

		if ( !this.nodes ) {
			// looks like we're in a server environment...
			// nothing to see here, move along
			return;
		}

		// remove existing nodes
		while ( this.nodes.length ) {
			node = this.nodes.pop();
			node.parentNode.removeChild( node );
		}

		if ( html === undefined ) {
			this.nodes = [];
			return;
		}

		// get new nodes
		this.nodes = insertHtml( html, this.docFrag );

		if ( !this.initialising ) {
			this.parentNode.insertBefore( this.docFrag, this.parentFragment.findNextNode( this ) );
		}
	},

	toString: function () {
		return ( this.value !== undefined ? this.value : '' );
	}
};
StringFragment = function ( options ) {
	initFragment( this, options );
};

StringFragment.prototype = {
	createItem: function ( options ) {
		if ( typeof options.descriptor === 'string' ) {
			return new StringText( options.descriptor );
		}

		switch ( options.descriptor.t ) {
			case INTERPOLATOR: return new StringInterpolator( options );
			case TRIPLE: return new StringInterpolator( options );
			case SECTION: return new StringSection( options );

			default: throw 'Something went wrong in a rather interesting way';
		}
	},


	bubble: function () {
		this.owner.bubble();
	},

	teardown: function () {
		var numItems, i;

		numItems = this.items.length;
		for ( i=0; i<numItems; i+=1 ) {
			this.items[i].teardown();
		}
	},

	getValue: function () {
		var value;
		
		// Accommodate boolean attributes
		if ( this.items.length === 1 && this.items[0].type === INTERPOLATOR ) {
			value = this.items[0].value;
			if ( value !== undefined ) {
				return value;
			}
		}
		
		return this.toString();
	},

	toString: function () {
		return this.items.join( '' );
	},

	toJSON: function () {
		var str, json;

		str = this.toString();

		try {
			json = JSON.parse( str );
		} catch ( err ) {
			json = str;
		}

		return json;
	}
};
// Interpolator or Triple
StringInterpolator = function ( options ) {
	this.type = INTERPOLATOR;
	initMustache( this, options );
};

StringInterpolator.prototype = {
	update: updateMustache,
	resolve: resolveMustache,

	render: function ( value ) {
		this.value = value;
		this.parentFragment.bubble();
	},

	teardown: function () {
		teardown( this );
	},

	toString: function () {
		return ( this.value === undefined ? '' : this.value );
	}
};
// Section
StringSection = function ( options ) {
	this.type = SECTION;
	this.fragments = [];
	this.length = 0;

	initMustache( this, options );
};

StringSection.prototype = {
	update: updateMustache,
	resolve: resolveMustache,

	teardown: function () {
		this.teardownFragments();

		teardown( this );
	},

	teardownFragments: function () {
		while ( this.fragments.length ) {
			this.fragments.shift().teardown();
		}
		this.length = 0;
	},

	bubble: function () {
		this.value = this.fragments.join( '' );
		this.parentFragment.bubble();
	},

	render: function ( value ) {
		updateSection( this, value );
		this.parentFragment.bubble();
	},

	createFragment: function ( options ) {
		return new StringFragment( options );
	},

	toString: function () {
		return this.fragments.join( '' );
	}
};
// Plain text
StringText = function ( text ) {
	this.type = TEXT;
	this.text = text;
};

StringText.prototype = {
	toString: function () {
		return this.text;
	},

	teardown: function () {} // no-op
};
getEl = function ( input ) {
	var output;

	if ( typeof window === 'undefined' || !doc || !input ) {
		return null;
	}

	// We already have a DOM node - no work to do. (Duck typing alert!)
	if ( input.nodeType ) {
		return input;
	}

	// Get node from string
	if ( typeof input === 'string' ) {
		// try ID first
		output = doc.getElementById( input );

		// then as selector, if possible
		if ( !output && doc.querySelector ) {
			output = doc.querySelector( input );
		}

		// did it work?
		if ( output.nodeType ) {
			return output;
		}
	}

	// If we've been given a collection (jQuery, Zepto etc), extract the first item
	if ( input[0] && input[0].nodeType ) {
		return input[0];
	}

	return null;
};
toString = Object.prototype.toString;

// thanks, http://perfectionkills.com/instanceof-considered-harmful-or-how-to-write-a-robust-isarray/
isArray = function ( obj ) {
	return toString.call( obj ) === '[object Array]';
};

isEqual = function ( a, b ) {
	if ( a === null && b === null ) {
		return true;
	}

	if ( typeof a === 'object' || typeof b === 'object' ) {
		return false;
	}

	return a === b;
};

// http://stackoverflow.com/questions/18082/validate-numbers-in-javascript-isnumeric
isNumeric = function ( n ) {
	return !isNaN( parseFloat( n ) ) && isFinite( n );
};

isObject = function ( obj ) {
	return ( typeof obj === 'object' && toString.call( obj ) === '[object Object]' );
};
// We're not using a constructor here because it's convenient (and more
// efficient) to pass e.g. transitionManager.pop as a callback, rather
// than wrapping a prototype method in an anonymous function each time
makeTransitionManager = function ( root, callback ) {
	var transitionManager, nodesToDetach, detachNodes, nodeHasNoTransitioningChildren;

	nodesToDetach = [];

	// detach any nodes which a) need to be detached and b) have no child nodes
	// which are actively transitioning. This will be called each time a
	// transition completes
	detachNodes = function () {
		var i, node;

		i = nodesToDetach.length;
		while ( i-- ) {
			node = nodesToDetach[i];

			// see if this node can be detached yet
			if ( nodeHasNoTransitioningChildren( node ) ) {
				node.parentNode.removeChild( node );
				nodesToDetach.splice( i, 1 );
			}
		}
	};

	nodeHasNoTransitioningChildren = function ( node ) {
		var i, candidate;

		i = transitionManager.active.length;
		while ( i-- ) {
			candidate = transitionManager.active[i];

			if ( node.contains( candidate ) ) {
				// fail as soon as possible
				return false;
			}
		}

		return true;
	};

	transitionManager = {
		active: [],
		push: function ( node ) {
			transitionManager.active[ transitionManager.active.length ] = node;
		},
		pop: function ( node ) {
			transitionManager.active.splice( transitionManager.active.indexOf( node ), 1 );
			
			detachNodes();

			if ( !transitionManager.active.length && transitionManager._ready ) {
				transitionManager.complete();
			}
		},
		complete: function () {
			if ( callback ) {
				callback.call( root );
			}
		},
		ready: function () {
			detachNodes();

			transitionManager._ready = true;
			if ( !transitionManager.active.length ) {
				transitionManager.complete();
			}
		},
		detachWhenReady: function ( node ) {
			nodesToDetach[ nodesToDetach.length ] = node;
		}
	};

	return transitionManager;
};
splitKeypath =  function ( keypath ) {
	var index, startIndex, keys, remaining, part;

	// We should only have to do all the heavy regex stuff once... caching FTW
	if ( keypathCache[ keypath ] ) {
		return keypathCache[ keypath ].concat();
	}

	keys = [];
	remaining = keypath;
	
	startIndex = 0;

	// Split into keys
	while ( remaining.length ) {
		// Find next dot
		index = remaining.indexOf( '.', startIndex );

		// Final part?
		if ( index === -1 ) {
			part = remaining;
			remaining = '';
		}

		else {
			// If this dot is preceded by a backslash, which isn't
			// itself preceded by a backslash, we consider it escaped
			if ( remaining.charAt( index - 1) === '\\' && remaining.charAt( index - 2 ) !== '\\' ) {
				// we don't want to keep this part, we want to keep looking
				// for the separator
				startIndex = index + 1;
				continue;
			}

			// Otherwise, we have our next part
			part = remaining.substr( 0, index );
			startIndex = 0;
		}

		if ( /\[/.test( part ) ) {
			keys = keys.concat( part.replace( /\[\s*([0-9]+)\s*\]/g, '.$1' ).split( '.' ) );
		} else {
			keys[ keys.length ] = part;
		}
		
		remaining = remaining.substring( index + 1 );
	}

	
	keypathCache[ keypath ] = keys;
	return keys.concat();
};
Ractive.prototype = proto;

Ractive.adaptors = adaptors;
Ractive.eventDefinitions = eventDefinitions;
Ractive.partials = {};

Ractive.easing = easing;
Ractive.extend = extend;
Ractive.interpolate = interpolate;
Ractive.interpolators = interpolators;
Ractive.parse = parse;

// TODO add some more transitions
Ractive.transitions = transitions;

Ractive.VERSION = VERSION;


// export as Common JS module...
if ( typeof module !== "undefined" && module.exports ) {
	module.exports = Ractive;
}

// ... or as AMD module
else if ( typeof define === "function" && define.amd ) {
	define( function () {
		return Ractive;
	});
}

// ... or as browser global
else {
	global.Ractive = Ractive;
}

}( typeof window !== 'undefined' ? window : this ));