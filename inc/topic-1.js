		// Root object
if ( typeof Synesis === "undefined" ) Synesis = { } ;
Synesis.isIndexPage =  document.location.pathname.endsWith( "index.htm"  );

		// Semaphore class for synchronization purposes
( function initSemaphore ( ) {

	if ( typeof Synesis.Semaphore === "undefined" ) Synesis.Semaphore = { } ;

		// Semaphore constructor function
	Synesis.Semaphore = function ( initialState, releaseHandlers ) { 
		// *	initialState
		// *		Value for the lock counter.
		// *	releaseHandlers
		// *		Optional, function or array of function references. 
		// *		Functions will be called when the semaphore becomes unlocked.
		//
		if ( typeof initialState === "undefined" ) initialState = 0;
		// Holds the lock status. Values > 0 are considered "locked".
		this.counter = initialState;
		// Functions are called when the lock is released.
		this.releaseHandlers = [ ] ;
		if ( releaseHandlers ) this.registerReleaseHandlers( releaseHandlers );
	} ; 

		// Returns true if the semaphore is locked.
	Synesis.Semaphore.prototype.isLocked = function () {
		return this.counter > 0;
	} ;

		// Registers a release handler function(s). 
	Synesis.Semaphore.prototype.registerReleaseHandlers = function ( fn ) {
		// *	Note that any object can be registered, not only functions,
		// *	but only functions will be called.
		if ( fn instanceof Array ) this.releaseHandlers = this.releaseHandlers.concat( fn );
		else this.releaseHandlers.push( fn );
	} ;

		// Increments the lock counter.
	Synesis.Semaphore.prototype.request = function ( n ) {
		if ( typeof n === "undefined" ) n = 1;
		this.counter += n;
	} ;

		// Decrements the lock counter and calls the release handlers if the semaphore becomes unlocked.
	Synesis.Semaphore.prototype.release = function ( n ) {
		var wasLocked = this.isLocked( );
		if ( typeof n === "undefined" ) n = 1;
		this.counter -= n;
		if ( wasLocked && ! this.isLocked( ) ) {
			for ( var i = 0 ; i < this.releaseHandlers.length ; i ++ ) {
				if ( this.releaseHandlers[ i ] instanceof Function ) this.releaseHandlers[ i ]( );
			}
		}
	} ;

} ) ( ) ;
		
		// Asynchrounous resource loader
( function initLoader( ) {

	if ( typeof Synesis.Loader === "undefined" ) Synesis.Loader = { } ;

		// Define the regular expression for prefixing URIs with a string.
	Synesis.Loader.uriPrefixingRegExp = new RegExp( "(src|href)\\s*=\\s*('|\")([^'\"]*)\\2" , "ig" );

		// Default Failure Handler
	Synesis.Loader.defaultFailureHandler = function defaultFailureHandler ( requestInfo, index ) {
		// *	this
		// *		XHR object that runs the request
		// *	requestInfo 
		// *		Data provided by the caller and normalized in the request method.
		// *	index
		// *		Index of the requested resource
		//
		console.error( "Synesis.Loader: Failed to load resource[" + index + "] " + requestInfo.uris[ index ] );
	} ;

		// Standard success handler to integrate HTML resources into the DOM.
	Synesis.Loader.integrateResponseHtml = function integrateResponseHtml ( requestInfo, index ) {
		// *	this
		// *		XHR object that runs the request
		// *	requestInfo 
		// *		Data provided by the caller and normalized in the request method.
		// *	requestInfo.targetContainers
		// *		Additional required member, contains the list of DOM elements 
		// *		that will receive the response text buffer.
		// *	index
		// *		Index of the requested resource
		//
		var targetContainer = requestInfo.targetContainers instanceof Array ? requestInfo.targetContainers[ index ] : requestInfo.targetContainers ;
		if ( typeof targetContainer === "string" ) {
			var s = targetContainer;
			targetContainer = document.getElementById( s );
			if ( typeof targetContainer === "undefined" ) {
				console.error( "Synesis.Loader.integrateResponseHtml() : Target container " + s + " not found!" ) ; 
				return;
			}
		}
		targetContainer.innerHTML += requestInfo.responseBuffers[ index ];
	} ;

		// Standard success handler to process links in the response text.
	Synesis.Loader.prefixLinks = function prefixLinks ( requestInfo, index ) {
		// *	this
		// *		XHR object that runs the request
		// *	requestInfo 
		// *		Data provided by the caller and normalized in the request method.
		// *	index
		// *		Index of the requested resource
		// *	The code uses a regular expression to insert the URI prefix 
		// *	into href and src attributes.
		requestInfo.responseBuffers[ index ] = requestInfo.responseBuffers[ index ].replace ( 
			Synesis.Loader.uriPrefixingRegExp, 
			"$1=$2" + requestInfo.uriPrefix + "$3$2" 
			) ;
	} ;

		// Calls the success handlers declared in the request info
	Synesis.Loader.internalSuccessHandler = function ( requestInfo, index ) {
		// *	this
		// *		XHR object that runs the request
		// *	requestInfo 
		// *		Data provided by the caller and normalized in the request method.
		// *	requestInfo.responseBuffer
		// *		Array of String, created here, contains the response text for the current request.
		// *	requestInfo.requestsFinished
		// *		The number of finished requests, including failed requests.
		// *	index
		// *		Index of the requested resource. Values are not necessarily in 
		// *		strictly ascending order!
		// *	Note
		// *		If a request handler function returns true, the call loop is terminated.
		//
		// Save the response text in the buffer.
		requestInfo.responseBuffers[ index ] = this.responseText;
		// Call the handler functions and pass the request info.
		for ( var j = 0 ; j < requestInfo.successHandlers.length ; j ++ ) {
			var fn = requestInfo.successHandlers[ j ];
			if ( fn instanceof Function && fn.call( this, requestInfo, index )) break;
		}
		// Indicated that the request is finished.
		requestInfo.requestsRunning.release( );
	} ;

		// Calls the failure handlers declared in the request info
	Synesis.Loader.internalFailureHandler = function ( requestInfo, index ) {
		// *	Runs in the condext of the XHR object
		// *	requestInfo 
		// *		Data provided by the caller and normalized in the request method.
		// *	index
		// *		Index of the requested resource
		//
		for ( var i = 0 ; i < requestInfo.failureHandlers.length ; i ++ ) {
			if ( requestInfo.failureHandlers[ i ].call( this, requestInfo, index )) break;
		}
		requestInfo.requestsRunning.release( );
	} ;

		// Resource request function
	Synesis.Loader.request = function( requestInfo ) {
		// *	requestInfo : Parameter object. 
		// *	requestInfo.uriPrefix
		// *		The string is prepended to URIs. Optional. 
		// *		Default: Empty string.
		// *	requestInfo.uris
		// *		Resource identifiers, will be prefixed with the uriPrefix string. 
		// *		Mandatory, String or Array of Strings.
		// *	requestInfo.targetContainers : Target element for the response text integration. 
		// *		For each URI requested, there must be a corresponding 
		// *		entry in this member.
		// *		Mandatory if integrateResponseHtml function is used.
		// *		String, object reference or Array of these.
		// *		This member is left untouched by this function.
		// *	requestInfo.successHandlers
		// *		Function(s) will be called on each ressource loaded successfully.
		// *		Function reference or Array of Function references.
		// *		Optional. Default: Synesis.Loader.integrateResponseHtml
		// *	requestInfo.failureHandlers
		// *		Function(s) will be called when resource loading failed.
		// *		Function reference or Array of Function refernces.
		// *		Optional. Default: Synesis.Loader.defaultFailureHandler
		// *	requestInfo.responseBuffers
		// *		Stores the response texts received by the XHRs. 
		// *		Created in this function.
		// *	requestInfo.requestsRunning
		// *		Semaphore, monitors the number active, unfinished requests.
		// *		Created in this function.
		// *	Success, failure and finished event handlers
		// *		If a handler function returns true, the following handlers will
		// *		not be called.
		//
		//	Validate and normalize parameter object.
		if ( ! requestInfo.uriPrefix ) requestInfo.uriPrefix = "";
		if ( ! ( requestInfo.uris instanceof Array )) requestInfo.uris = [ requestInfo.uris ] ;
		if ( typeof requestInfo.targetContainers !== "undefined" && ! ( requestInfo.targetContainers instanceof Array )) requestInfo.targetContainers = [ requestInfo.targetContainers ] ;
		if ( ! ( requestInfo.successHandlers instanceof Array )) requestInfo.successHandlers = [ requestInfo.successHandlers ] ;
		if ( typeof requestInfo.failureHandlers === "undefined" ) { requestInfo.failureHandlers = [ ];  requestInfo.failureHandlers[ 0 ] = Synesis.Loader.defaultFailureHandler }
		else if ( ! ( requestInfo.failureHandlers instanceof Array )) requestInfo.failureHandlers = [ requestInfo.failureHandlers ] ;
		requestInfo.responseBuffers = [ ] ;
		requestInfo.requestsRunning = new Synesis.Semaphore( requestInfo.uris.length, requestInfo.finishedHandlers );
		//
		// Initiate the requests.
		for ( var i = 0 ; i < requestInfo.uris.length ; i ++ ) {
			var xhr = new XMLHttpRequest( );
			xhr.addEventListener( "load", Synesis.Loader.internalSuccessHandler.bind( xhr, requestInfo, i ));
			xhr.addEventListener( "error", Synesis.Loader.internalFailureHandler.bind( xhr, requestInfo, i ));
			xhr.open( "GET", requestInfo.uriPrefix + requestInfo.uris[ i ] );
			xhr.send( );
		}
	}
} ) ( ) ;

		// Compatibility helper functions
( function initCompatibility ( ) {
	
	if ( typeof Synesis.Compatibility === "undefined" ) Synesis.Compatibility = { } ;

	Synesis.Compatibility.stopEventPropagation = function ( evt ) {
		evt = evt || window.event;
		if ( evt.stopPropagation ) evt.stopPropagation( );
		else evt.cancelBubble = true;
	} ;
} ) ( ) ;
	
		// Collapsible block functions
( function initCollapsibleBlock ( ) {
	
	if ( typeof Synesis.CollapsibleBlock === "undefined" ) Synesis.CollapsibleBlock = { } ;
	
	var errorInfo = "topic.js, initCollapsibleBlocks() : ";

		// Update the block style when the transition finished.
	Synesis.CollapsibleBlock.transitionEnd = function ( evt ) {
		evt = evt || window.event;
		if ( this.style.height !== "0px" ) this.style.height = "auto";
		evt.stopPropagation();
		return false;
	}

		// Expand a single block
	Synesis.CollapsibleBlock.expand = function ( controller ) {
		// Returns true if the controller state actually changed.
		// Expand the block to the required height
		if ( controller.getAttribute( "cbs" ) === "0" ) return false;
		// Controllers may not already be initialized.
		if ( controller.Synesis && controller.Synesis.block ) {
			// Set style height temporarily to "auto" to get the required numerical value for the transition.
			controller.Synesis.block.style.height = "auto";
			var height = window.getComputedStyle( controller.Synesis.block ).getPropertyValue( "height" );
			controller.Synesis.block.style.height = "0px";
			// Set the style height on a new script engine loop.
			window.setTimeout( function( ) { 
				controller.Synesis.block.style.height = height; 
			} , 100 );
		}
		// Update controller state.
		controller.setAttribute( "cbs", "0" );
		return true;
	};

		// Expand all collapsible blocks
	Synesis.CollapsibleBlock.expandAll = function ( ) {
		var controllers = document.querySelectorAll( "[cbs]" );
		for ( var i = 0 ; i < controllers.length ; i ++ ) Synesis.CollapsibleBlock.expand( controllers[ i ] );
	} ;

		// Collapse a block
	Synesis.CollapsibleBlock.collapse = function( controller ) {
		// Set style height to ensure a numerical transition start value (instead of "auto").
		controller.Synesis.block.style.height = window.getComputedStyle( controller.Synesis.block ).getPropertyValue( "height" );
		// Collapse the block on a new script engine loop.
		window.setTimeout( function ( ) { controller.Synesis.block.style.height = "0px"; }, 100 );		
		// Set the new controller state.
		controller.setAttribute( "cbs", "1" );
	};

		// Collapse all collapsible blocks
	Synesis.CollapsibleBlock.collapseAll = function ( ) {
		var controllers = document.querySelectorAll( "[cbs]" );
		for ( var i = 0 ; i < controllers.length ; i ++ ) Synesis.CollapsibleBlock.collapse( controllers[ i ] );
	} ;

		// Click event handler for the collapsible block controllers.
	Synesis.CollapsibleBlock.clickHandler = function ( evt ) { 
		evt = evt || window.event;
		// Bypass if the controller icon has not been hit.
		if ( evt.offsetX > 40 ) return;
		switch ( this.getAttribute( "cbs" ) ) {
		case "0" :  // block is expanded
				Synesis.CollapsibleBlock.collapse( this );
				break;
		case "1" :  // block is collapsed.
				Synesis.CollapsibleBlock.expand( this );
				break;
		default:
			console.error ( errorInfo + "Illegal controller state, reset to 0." );
			controller.setAttribute( "cbs", "0" );
			controller.Synesis.block.style.height = "auto";
		}
		// Declare the event handled.
		Synesis.Compatibility.stopEventPropagation( evt );
		evt.preventDefault();
		return false;
	} ;

		// Expand all blocks that contain the link target element
	Synesis.CollapsibleBlock.expandParentBlocks = function ( target ) {
		// Returns true if at least one block was expanded.
		var result = false;
		// Loop through the parent elements.
		while ( target && target.tagName !== "BODY" ) {
			// Look for a collapsible block controller.
			var controller = target;
			if ( ! controller.hasAttribute( "cbs" )) controller = target.previousElementSibling;
			// If there is one, expand its block.
			if ( controller && controller.hasAttribute( "cbs" )) result |= Synesis.CollapsibleBlock.expand( controller );
			// Ascend to the parent node.
			target = target.parentNode;
		}
		return result;
	} ;

		// Initialize collapsible blocks in the document.
	Synesis.CollapsibleBlock.initDocument = function ( target ) {
		// *	
		// *	Must be called when the document has been loaded competely.
		// *	Method deletes itself when done.
		
		// Collect the collabsible block controllers on the page
		// and exit if there is nothing to do.
		var controllers = document.querySelectorAll( "[cbs]" );
		if ( controllers.length === 0 ) return;

		// Expand all blocks that contain the navigation target element 
		// (id in the hash), and the link target itself.
		// Only the block controller status will be changed here.
		var hash = document.location.hash;
		if ( hash ) {
			var linkTarget = document.getElementById( hash.substr( 1 ));
			Synesis.CollapsibleBlock.expandParentBlocks( linkTarget );
			window.setTimeout ( function( ) { 
				linkTarget.scrollIntoView( { behavior:"smooth" } );
			} , 100 );
		}

		// Initialize controllers and blocks.
		for ( var i = 0 ; i < controllers.length ; i ++ ) {
			var controller = controllers[ i ];
			// Create the root element for user-defined members.
			if ( typeof controller.Synesis === "undefined" ) controller.Synesis = { } ;
			// Find the associated collapsible block.
			// TODO: Use a search function here to skip comment elements.
			var block = controller.Synesis.block = controller.nextElementSibling;
			// Collapse blocks if the controller status indicates so.
			if ( controller.getAttribute( "cbs" ) === "1" ) block.style.height = "0px" ;
			// Register event handlers.
			controller.addEventListener( "click", Synesis.CollapsibleBlock.clickHandler.bind( controller ));
			controller.style.transition = "margin-top linear 1s, margin-bottom linear 1s";
			block.addEventListener( "transitionend", Synesis.CollapsibleBlock.transitionEnd.bind( block ));
			block.style.transition = "height linear 1s";
		}

		controllers = null;	// Release memory.

		// Modify links that point to an element in the document.
		var links = document.getElementsByTagName( "A" ) ;
		for ( var i = 0 ; i < links.length ; i ++ ) {
			var link = links[ i ];
			// Check whether the anchor element qualifies for monitoring.
			if ( link.pathname !== document.location.pathname ) continue;
			if ( ! link.hash ) continue;
			var target = document.getElementById( link.hash.substr( 1 )); 
			if ( ! target ) continue;
			// The link is qualified.
			link.addEventListener( "click", function( target, evt ) { 
				// Function scrolls the target element into view.
				// Prevent the default link action.
				evt = evt || window.event;
				evt.preventDefault( );
				var delay = Synesis.CollapsibleBlock.expandParentBlocks( target ) ? 1100 : 10;
				// Make sure the link target element is visible.
				window.setTimeout ( function ( ) { 
					target.scrollIntoView( { behavior:"smooth", block: "center" } );
					target.scrollIntoView( );
					} , delay );
				return false;
			}.bind ( link, target  )) ;
			continue;
		}
		links = null;
		// Job done, release ressources.
		delete Synesis.CollapsibleBlock.initDocument;
	} ;

} ) ( ) ;

		// Collapsible Tree
( function initCollapsibleTree ( ) {

		// Node states: 0=expanded 1=collapsed
	if ( typeof Synesis.CollapsibleTree === "undefined" ) Synesis.CollapsibleTree = { } ;

		// Regular expression to find "abstract" tree nodes.
	Synesis.CollapsibleTree.AbstractNodeTest = new RegExp( "\\babstract\\b" );
	
		// Change height style to "auto" when node expansion is complete.
	Synesis.CollapsibleTree.transitionEndHandler = function ( evt ) {
		evt = evt || window.event;
		target = evt.target || evt.srcElement;
		if ( target.tagName === "UL" && target.style.height !== "0px" ) target.style.height = "auto";
	} ;

		// Collapse a tree node.
	Synesis.CollapsibleTree.collapse = function ( li, ul ) {
		ul.style.height = window.getComputedStyle( ul ).getPropertyValue( "height" );
		window.setTimeout( function ( ) { ul.style.height = "0px" } , 100 ) ;
	} ;
		
		// Collapses the entire tree.
	Synesis.CollapsibleTree.collapseAll = function ( ) {
			var controllers = document.querySelectorAll ( "[cts]" );
			for ( var i = 0 ; i < controllers.length ; i ++ ) {
				var li = controllers[ i ];
				var ul = li.getElementsByTagName( "UL" )[ 0 ];
				// Call the event handler for the state, and set the next state.
				Synesis.CollapsibleTree.collapse( li, ul );
				li.setAttribute( "cts", "1" );
			}
		} ;

		// Expand a tree node.
	Synesis.CollapsibleTree.expand = function ( li, ul ) {
			ul.style.height = "auto" ;
			var h = window.getComputedStyle( ul ).getPropertyValue( "height" );
			ul.style.height = "0px" ;
			window.setTimeout ( function ( ) {
				ul.style.height = h;
			} , 100 ) ;
		};
		
		// Expands the entire tree.
	Synesis.CollapsibleTree.expandAll = function ( ) {
			var controllers = document.querySelectorAll ( "[cts]" );
			for ( var i = 0 ; i < controllers.length ; i ++ ) {
				var li = controllers[ i ];
				var ul = li.getElementsByTagName( "UL" )[ 0 ];
				// Call the event handler for the state, and set the next state.
				Synesis.CollapsibleTree.expand( li, ul );
				li.setAttribute( "cts", "0" );
			}
		} ;
	
		// State Action Map for a standard collapsible tree
	Synesis.CollapsibleTree.stateActionMap = [ 
		Synesis.CollapsibleTree.collapse,				// 0 - Child nodes expanded
		Synesis.CollapsibleTree.expand					// 1 - Child nodes collapsed
		] ;

		// Handles click events on node icons and collapses or expands nodes.
	Synesis.CollapsibleTree.clickHandler = function ( evt ) {
		// *	this
		// *		Points the to tree root node.
		//
		evt = evt || window.event;
		target = evt.target || evt.srcElement;
		if ( target && target.tagName === "LI" && target.hasAttribute( "cts" ) && evt.offsetX < 40 ) {
			var ul = target.getElementsByTagName( "UL" )[ 0 ];
			// Call the event handler for the state, and set the next state.
			var nodeState = target.getAttribute( "cts" );
			target.Synesis.stateActionMap[ nodeState ]( target, ul );
			li.setAttribute( "cts", ++nodeState % target.Synesis.stateActionMap.length );
			evt.stopPropagation( );
		}
	} ;

		// Initializes collapsible tree structures.
	Synesis.CollapsibleTree.initDocument = function ( ) { 
		//
		// Collect and process collapsible trees.
		var trees = document.getElementsByClassName( "tree" );
		for ( var i = 0 ; i < trees.length ; i ++ ) {
			var tree = trees[ i ];
			// Add event handlers.
			if ( ! tree.hasAttribute( "customHandler" )) tree.addEventListener( "click" , Synesis.CollapsibleTree.clickHandler );
			tree.addEventListener( "transitionend" , Synesis.CollapsibleTree.transitionEndHandler );
			// Collect nested UL elements and set the status attribute in their parent LI node. 
			var uls = tree.getElementsByTagName ( "UL" );
			for ( var j = 0 ; j < uls.length ; j ++ ) {
				var ul = uls[ j ];
				var parent = ul.parentNode;
				if ( ! parent.Synesis ) parent.Synesis = { } ;
				if ( typeof parent.Synesis.nodeStates === "undefined" ) parent.Synesis.stateActionMap = Synesis.CollapsibleTree.stateActionMap;
				if ( ! parent.hasAttribute( "cts" )) {
					ul.style.height = "0px" ;
					parent.setAttribute( "cts", "1" );
				}
			}
		}

		// Harakiri
		delete Synesis.CollapsibleTree.initDocument;
	} ;

} ) ( ) ;

		// Navigation panel functions
( function initNavigation ( ) { 

	if ( typeof Synesis.Navigation === "undefined" ) Synesis.Navigation = { } ;

		// Open the navigation panel.
	Synesis.Navigation.expand = function ( ) {
		var navpanel = Synesis.Navigation.panel;
		navpanel.style.width = "auto";
		var expandedWidth = window.getComputedStyle( navpanel )[ "width" ];
		navpanel.style.width = "0px";
		window.setTimeout( function ( ) {
			navpanel.style.left = "0px";
			navpanel.style.width = expandedWidth;
		} , 100 ) ;
	} ;

		// Close the navigation panel.
	Synesis.Navigation.collapse = function ( ) {
			var navpanel = Synesis.Navigation.panel;
			navpanel.style.width = window.getComputedStyle( navpanel )[ "width" ];
			window.setTimeout( function ( ) { 
				navpanel.style.width = "0px";
				navpanel.style.left = "-20px";
			}, 100 ) ;
	} ;

	Synesis.Navigation.show = function () {
		var panel = this.panel;
		var w = parseFloat( document.getElementsByTagName("BODY")[ 0 ].clientWidth ) ;
		panel.style.width = w - 8 + "px" ;
		panel.style.left = (-w - 14) + "px";
		panel.style.transition = "" ;
		window.setTimeout( function ( ) {  panel.style.transition = "left linear 1s" ; panel.style.left = "0px" ; } , 100 );
	} ;

	Synesis.Navigation.hide = function () {
		this.panel.style.width = (this.panel.offsetWidth - 24) + "px";
		this.panel.style.left = "-" + (this.panel.offsetWidth - 2) + "px" ;
	} ;

		// Document init function.
	Synesis.Navigation.initDocument = function () {
		// Find the navigation tree container.
		var navpanel = Synesis.Navigation.panel = document.getElementById( "navigation-panel" );
		if ( ! navpanel ) navpanel = Synesis.Navigation.panel = document.getElementById( "navigation-tree" );
		// Eventhandler to close the navpanel.
		navpanel.addEventListener( "click", function( evt ) {
			evt = evt || window.event;
			var target = evt.target || evt.srcElement;
			if ( target && target.tagName !== "A" ) Synesis.Navigation.hide( );
		}.bind( navpanel ) ) ;
		navpanel.style.display = "block";
		Synesis.Navigation.hide( );
		window.setTimeout( function ( ) { navpanel.style.transition = "left linear 1s" ; }, 100 );
		// Harakiri
		delete Synesis.Navigation.initDocument;
	} ;

} ) ( ) ;

		// Navigation Tree
( function initNavigationTree() {

		// Overrides CollapsibleTree and add functions.
	if ( ! Synesis.NavigationTree ) Synesis.NavigationTree = { } ;
		
		// References the path nodes from root to the current document parent.
	Synesis.NavigationTree.pathNodes = [ ] ;
	
		// Opens the node to show the abstract.
	Synesis.NavigationTree.showAbstract = function ( li, ul ) {
		var abstract = li.Synesis.abstract;
		abstract.style.marginBottom = "10px";
		abstract.style.height = "auto" ;
		var h = window.getComputedStyle( abstract ).getPropertyValue( "height" );
		abstract.style.height = "0px" ;
		abstract.style.marginBottom = "0px" ;
		window.setTimeout ( function ( ) { abstract.style.height = h; abstract.style.marginBottom = "10px"; } , 100 ) ;
	} ;

		// Hides the abstract block.
	Synesis.NavigationTree.hideAbstract = function ( li, ul ) {
		li.Synesis.abstract.style.height = "0px" ;
		li.Synesis.abstract.style.marginBottom = "0px";
	} ;

		// Retrieves the abstract block.
	Synesis.NavigationTree.getAbstract = function ( node ) {
		// *	node : The tree node (LI) or one of its child nodes.
		// *	returns : null or the abstract element of the tree node.
		//
		// Ascend to the LI element 
		while ( node && node.tagName !== "LI" ) node = node.parentNode;
		if ( ! node ) return null;
		// Retrieve abstract child elements and test the parent referenc
		// of the first in the list.
		var abstracts = node.getElementsByTagName( "ABSTRACT" );
		if ( abstracts && abstracts.length > 0 && abstracts[ 0 ].parentNode === node ) return abstracts[ 0 ] ;
	} ;

		// Node states and associated handler functions for tree nodes.
	Synesis.NavigationTree.stateActionMapNode = [ 
		Synesis.NavigationTree.hideAbstract,			// 0 - Abstract expanded, Child nodes collapsed
		Synesis.NavigationTree.showAbstract,			// 1 - Abstract collapsed, Child nodes collapsed
		Synesis.CollapsibleTree.expand,					// 2 - Abstract expanded, Child nodes collapsed
		Synesis.CollapsibleTree.collapse					// 3 - Abstract expanded, Child nodes expanded
		] ;
	
		// Node states and associated handler functions for leaf nodes.
	Synesis.NavigationTree.stateActionMapLeaf = [ 
		Synesis.NavigationTree.hideAbstract,		// 0 - Abstract expanded, Child nodes collapsed
		Synesis.NavigationTree.showAbstract		// 1 - Abstract collapsed, Child nodes collapsed
		] ;
		
		// Handles click events on node icons.
	Synesis.NavigationTree.clickHandler = function ( evt ) {
		// *	this
		// *		Points the to tree root node.
		//
		evt = evt || window.event;
		target = evt.target || evt.srcElement;
		if ( target && target.tagName === "LI" && target.hasAttribute( "cts" ) && evt.offsetX < 40 ) {
			var ul = target.getElementsByTagName( "UL" )[ 0 ];
			// Call the event handler for the current state
			var state = target.getAttribute( "cts" );
			target.Synesis.stateActionMap[ state ]( target, ul );
			//  Set the next state, depending on the presence of an abstract element.
			target.setAttribute( "cts", ++ state % target.Synesis.stateActionMap.length );
			evt.stopPropagation( );
		}
	} ;

		// Unfolds the entire path from root to node.
	Synesis.NavigationTree.expandPath = function ( root, node ) {
		// *	Node must be the parent node of the current page node.
		while ( node && node !== root ) {
			if ( node.tagName === "UL" ) node.style.height = "auto" ;
			else if ( node.tagName === "LI" ) {
				node.setAttribute( "cts", "0" );
				Synesis.NavigationTree.pathNodes.unshift( node );
			}
			node = node.parentNode;
		}
	} ;
	
		// Sets the href attribute of naviation links found on the page.
	Synesis.NavigationTree.initNavigationLinks = function( linktype, target ) {
		if ( typeof target === "undefined" ) return;
		var links = document.querySelectorAll( "[navigate='" + linktype + "']" );
		for ( var i = 0 ; i < links.length ; i ++ )  {
			var href = target.getAttribute( "href" );
			if ( href.endsWith( "table-of-contents.htm" )) continue;
			links[ i ].setAttribute( "href", href );
		}
	} ;

		// Looks for known navigation links on the page and fills their href attribute.
	Synesis.NavigationTree.initPageNavigation = function ( ) { 
		Synesis.NavigationTree.initNavigationLinks( "prev", Synesis.NavigationTree.previousPage );
		Synesis.NavigationTree.initNavigationLinks( "next", Synesis.NavigationTree.followingPage );
	} ;

		// Initializes the special tree on the navigation panel and overrides the 
	Synesis.NavigationTree.initDocument = function ( ) {
		//
		// Process the tree on the navigation panel.
		var trees = document.getElementsByClassName( "navigation tree" );
		for ( var i = 0 ; i < trees.length ; i ++ ) {
			var tree = trees[ i ];
			// Add that navigation tree click event handler, which takes the role
			// of the standard tree click event handler. Note that a navigation tree
			// must have the "customHandler" attribute.
			tree.addEventListener( "click" , Synesis.NavigationTree.clickHandler );
			
			// Treat nodes with an "abstract" element.
			var abstracts = tree.getElementsByTagName( "ABSTRACT" );
			for ( var j = 0 ; j < abstracts.length ; j ++ ) {
				// Setup the abstract element.
				var abstract = abstracts[ j ];
				var node = abstract.parentNode;
				if ( ! node.Synesis ) node.Synesis = { } ;
				// Set the correct action map on the node.
				if ( abstract.nextElementSibling && abstract.nextElementSibling.tagName === "UL" )
					node.Synesis.stateActionMap = Synesis.NavigationTree.stateActionMapNode;
				else {
					node.Synesis.stateActionMap = Synesis.NavigationTree.stateActionMapLeaf ;
					if ( ! node.hasAttribute( "cts" )) node.setAttribute( "cts", "1" );
					}
				abstract.style.height = "0px" ;
				// Save a reference in the node info.
				node.Synesis.abstract = abstract;
			}
			
			// Find the node that links to the current document.
			var anchors = tree.getElementsByTagName( "A" );
			var docpath = document.location.pathname;
			for ( var j = 0 ; j < anchors.length ; j ++ ) {
				var anchor = anchors[ j ];
				if ( anchor.pathname !== docpath ) continue;
				// This code runs only once.
				// Indicate that the node is "active" 
				anchor.parentNode.setAttribute( "active", "1" );
				// Expand the path to the document node
				Synesis.NavigationTree.expandPath( tree, anchor.parentNode.parentNode );
				// Store references to current and neighbour nodes.
				Synesis.NavigationTree.currentPage = anchors[ j ];
				Synesis.NavigationTree.previousPage = j > 0 ? anchors[ j - 1 ] : anchors[ anchors.length - 1 ];
				Synesis.NavigationTree.followingPage = j < anchors.length - 1 ? anchors[ j + 1 ] : anchors[ 0 ];
				// Initialize the document abstract box.
				var abstractTarget = document.getElementById( "abstract");
				if ( ! abstractTarget ) break;
				var abstractSource = Synesis.NavigationTree.getAbstract( anchor.parentNode );
				if ( ! abstractSource ) break;
				// Fill the abstract target container
				abstractTarget.innerHTML = abstractSource.innerHTML;
				// Look no further
				break;
			}

			// Check: Document in ToC?
			if ( ! Synesis.NavigationTree.currentPage ) console.warn( "Page has no entry in the table-of-contents." );
		}
		
		// Initialize navigation links in the document.
		Synesis.NavigationTree.initPageNavigation( );

		// Harakiri
		delete Synesis.NavigationTree.initDocument ;
	} ;

} ) ( ) ;

		// Page Menu Functions
( function initPageMenu ( ) { 

	if ( typeof Synesis.Menu === "undefined" ) Synesis.Menu = { } ;

		// Expand all collapsible blocks
	Synesis.Menu.expandAll = function ( ) { 
		if ( Synesis.isIndexPage ) Synesis.CollapsibleTree.expandAll( );
		else Synesis.CollapsibleBlock.expandAll( );
	} ;

		// Collapse all collapsible blocks
	Synesis.Menu.collapseAll = function ( ) { 
		if ( Synesis.isIndexPage ) Synesis.CollapsibleTree.collapseAll( );
		else Synesis.CollapsibleBlock.collapseAll( );
	} ;

		// Open or close the navigation panel
	Synesis.Menu.navigate = function ( ) {
		var navpanel = document.getElementById( "navigation-panel" );
		if ( ! navpanel ) return;
		if ( navpanel.style.left === "0px" ) Synesis.Navigation.hide( );
		else Synesis.Navigation.show( );
	} ;

		// Initialize the page menu structures.
	Synesis.Menu.initDocument = function ( ) {
		var menuPanel = document.getElementById( "page-menu" );
		if ( ! menuPanel ) return;
		var s = '<div><a href="../index.htm">Home</a></div> <div> <a navigate="prev">&larr;</a></div> <div><a navigate="next">&rarr;</a></div>';	
		if ( ! Synesis.isIndexPage ) s += ' <div onclick="Synesis.Menu.navigate()">Table of Contents</div>';
		s += ' <div onclick="Synesis.Menu.expandAll()">&oplus;</div> <div onclick="Synesis.Menu.collapseAll()">&ominus;</div>';		
		menuPanel.innerHTML = s;
		// Harakiri
		delete Synesis.Menu.initDocument;
	} ;

		// The init functions is always called synchronously.
	Synesis.Menu.initDocument( );
} ) ( ) ;

		// Page Footer Functions
( function initPageFooter() {
	
		// The html for the footer element.
	var s = "" ;
		
		// Add information from a meta tag to the footer html string.
	var addMetaInfo = function ( name, label ) {
		var e = document.querySelector( "meta[name='" + name + "']" );
		if ( ! e ) return;
		if ( s.length > 0 ) s += " &bull; " ; 
		s += label + ": " + e.getAttribute( "content" );
	} ;

		// Find the footer element.
	var footer = document.getElementById( "page-footer" );
	if ( ! footer ) {
		footer = document.createElement( "DIV" );
		footer.className = "footer" ;
	}
	
		// Collect meta tag information.
	addMetaInfo( "author", "Page Author" );
	addMetaInfo( "creation-date", "Created" );
	addMetaInfo( "editor", "Page Editor" );
	addMetaInfo( "modification-date", "Last Update" );
	addMetaInfo( "document-version", "Version" );
	
		// Set the footer content.
	footer.innerHTML = s;
		
		// Append the footer to the document.
	document.body.appendChild( footer );
		
} ) ( ) ;
 