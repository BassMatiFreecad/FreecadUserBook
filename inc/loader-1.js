// Background Info
//		The Loader provides an asynchronous resource loading feature.
//		The caller provides a list of URIs and a set of handling functions
//		which are called when the requested ressources arrive here at the
//		client.
//		The Loader provides a set of standard handling functions, for 
//		example to treat links in the resource data, and integrate the 
//		resource into the document.

if ( typeof Synesis === "undefined" ) Synesis = { } ;
if ( typeof Synesis.Sema === "undefined" ) Synesis.Sema = { } ;
if ( typeof Synesis.Loader === "undefined" ) Synesis.Loader = { } ;

		// Semaphore class for synchronization purposes
( function initSema ( ) {

		// Contructor function
	Synesis.Sema = function ( initialState ) { 
		if ( typeof initialState === "undefined" ) initialState = 0;
		// Holds the lock status. Values > 0 are considered "locked".
		this.counter = initialState;
		// Functions are called when the lock is released.
		this.releaseHandlers = [ ] ;
	} ; 

		// Returns true if the lock counter is 1 or higher.
	Synesis.Sema.prototye.isLocked = function () {
		return this.counter > 0;
	} ;

		// Registers a release handler function.
	Synesis.Sema.prototype.registerReleaseHandler = function ( fn ) {
		if ( ! this.isLocked( ) && fn instanceof Function ) fn( );
		else this.releaseHandlers.push( fn );
	} ;

		// Increments the lock counter.
	Synesis.Sema.prototype.request = function ( n ) {
		if ( typeof n === "undefined" ) n = 1;
		this.counter += n;
	} ;

		// Decrements the lock counter and calls the release handlers if the lock is released.
	Synesis.Sema.prototype.release = function ( n ) {
		var wasLocked = this.isLocked( );
		if ( typeof n === "undefined" ) n = 1;
		this.counter -= n;
		if ( ! wasLocked && this.isLocked( ) ) {
			for ( var i = 0 ; i < this.releaseHandlers.length ; i ++ ) {
				var handler = Synesis.Loader.documentCompleteHandlers[ i ];
				if ( handler instanceof Function ) handler( );
			}
		}
	} ;

} ) ( ) ;
		
		// Asynchrounous resource loader
( function initLoader() {
		
		// Default Failure Handler
	Synesis.Loader.defaultFailureHandler = function defaultFailureHandler ( requestInfo, index ) {
		// *	Runs in the condext of the XHR object
		// *	requestInfo 
		// *		Data provided by the caller and normalized in the request method.
		// *	index
		// *		Index of the requested resource
		//
		console.log( "Synesis.Loader: Failed to load resource[" + index + "]." );
		requestInfo.requestsFinished += 1;
		// Bail out except for the final response of a deferred request.
		if ( ! requestInfo.deferUntilComplete || requestInfo.requestsFinished < requestInfo.uris.length ) return;
		// Loop through the responses in the user-defined order.
		for ( var i = 0 ; i < requestInfo.uris.length ; i ++ ) {
			// Call the handler functions and pass the request info.
			for ( var j = 0 ; j < requestInfo.successHandlers.length ; j ++ ) {
				if ( requestInfo.successHandlers[ j ].call( this, requestInfo, i )) break;
			}
		}
	} ;

		// Calls the failure handlers declared in the request info
	Synesis.Loader.internalFailureHandler = function ( requestInfo, index ) {
		// *	Runs in the condext of the XHR object
		// *	requestInfo 
		// *		Data provided by the caller and normalized in the request method.
		// *	index
		// *		Index of the requested resource
		//
		for ( var i = 0 ; i < requestInfo.failure.length ; i ++ ) {
			if ( requestInfo.failure[ i ].call( this, requestInfo )) break;
		}
	} ;

		// Standard success handler to integrate HTML resources into the DOM.
	Synesis.Loader.integrateResponseHtml = function integrateResponseHtml ( requestInfo, index ) {
		// *	Runs in the condext of the XHR object
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

		// Define the regular expression for prefixing URIs with a string.
	Synesis.Loader.uriPrefixingRegExp = new RegExp( "(src|href)\\s*=\\s*('|\")([^'\"]*)\\2" , "ig" );

		// Standard success handler to process links in the response text.
	Synesis.Loader.prefixLinks = function prefixLinks ( requestInfo, index ) {
		// *	Runs in the condext of the XHR object
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
		console.log( requestInfo.responseBuffers[ index ] );
	} ;

		// Calls the success handlers declared in the request info
	Synesis.Loader.internalSuccessHandler = function ( requestInfo, index ) {
		// *	Runs in the condext of the XHR object
		// *	requestInfo 
		// *		Data provided by the caller and normalized in the request method.
		// *	requestInfo.responseBuffer
		// *		Array of String, created here, contains the response text for the current request.
		// *	requestInfo.requestsFinished
		// *		The number of finished requests, including failed requests.
		// *	index
		// *		Index of the requested resource. Values are not necessarily in 
		// *		strictly ascending order!
		//
		Synesis.Loader.requestsPending -= 1;
		requestInfo.requestsFinished += 1;
		// Create the response text buffers and copy the response text for this request.
		requestInfo.responseBuffers[ index ] = this.responseText;
		if ( requestInfo.deferUntilComplete ) {
			// Bail out except for the final response.
			if ( requestInfo.requestsFinished < requestInfo.uris.length ) return;
			// Set index boundaries to include all responses.
			var lower = 0;
			var upper = requestInfo.uris.length;
		}
		else var lower = index, upper = index + 1;  // Process only current response.
		// Loop through the responses.
		for ( var i = lower ; i < upper ; i ++ ) {
			// Call the handler functions and pass the request info.
			for ( var j = 0 ; j < requestInfo.successHandlers.length ; j ++ ) {
				if ( requestInfo.successHandlers[ j ].call( this, requestInfo, i )) break;
			}
		}
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
		// *	requestInfo.deferUntilComplete
		// *		If true, the response will be stored and processed when all 
		// *		resources have been loaded.
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
		// *	requestInfo.requestsFinished
		// *		Number of succeeded or failed requests.
		// *		Created in this function.
		//
		//	Validate and normalize parameter object.
		if ( ! requestInfo.uriPrefix ) requestInfo.uriPrefix = "";
		if ( ! ( requestInfo.uris instanceof Array )) requestInfo.uris = [ requestInfo.uris ] ;
		if ( typeof requestInfo.targetContainers !== "undefined" && ! ( requestInfo.targetContainers instanceof Array )) requestInfo.targetContainers = [ requestInfo.targetContainers ] ;
		if ( typeof requestInfo.deferUntilComplete === "undefined" ) requestInfo.deferUntilComplete = false;
		if ( ! ( requestInfo.successHandlers instanceof Array )) requestInfo.successHandlers = [ requestInfo.successHandlers ] ;
		if ( typeof requestInfo.failureHandlers === "undefined" ) { requestInfo.failureHandlers = [ ];  requestInfo.failureHandlers[ 0 ] = Synesis.Loader.defaultFailureHandler }
		else if ( ! ( requestInfo.failureHandlers instanceof Array )) requestInfo.failureHandlers = [ requestInfo.failureHandlers ] ;
		requestInfo.requestsFinished = 0;
		requestInfo.responseBuffers = [ ] ;
		//
		// Initiate the requests.
		for ( var i = 0 ; i < requestInfo.uris.length ; i ++ ) {
			var xhr = new XMLHttpRequest( );
			xhr.addEventListener( "load", Synesis.Loader.internalSuccessHandler.bind( xhr, requestInfo, i ));
			xhr.addEventListener( "error", Synesis.Loader.internalFailureHandler.bind( xhr, requestInfo, i ));
			xhr.open( "GET", requestInfo.uriPrefix + requestInfo.uris[ i ] );
			xhr.send( );
			Synesis.Loader.requestsPending += 1;
		}
	}
} ) ( ) ;
