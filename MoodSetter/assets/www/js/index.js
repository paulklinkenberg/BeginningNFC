/*
    CURRENT STATUS:
        can pick songs
        can set lights
        can write current settings to tag
        can read current settings from tag

    TODO:
        Audio song display not working properly
        Read from tag using background dispatch not reliable
*/

var hub = {                         // a copy of the hue settings
    lights: {},                     // states and names for the individual lights
    ipaddress: null,                // ip address of the hue
    appTitle: "NFC Mood Setter",    // The App name
    username: "yourusername",       // fill in your Hue user name here
    currentLight: 1                 // the light you're currently setting
 };

var app = {}
    mode: "write",                  // the tag read/write mode
    mimeType: 'text/hue',           // the NFC record MIME Type

   // parameters for audio playback:
    // The path to the folder where you keep all your music:
    musicPath: "file:///sdcard/Download/",
    songPlaying: null,      // media handle for the current song playing
    songTitle: null,        // title of the song
    musicState: 0,          // state of the song: playing stopped, etc.

/*
    Application constructor
*/
    initialize: function() {
        this.bindEvents();
        console.log("Starting Mood Setter app");
    },

    // bind any events that are required on startup to listeners:
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);

        // hue faders from the UI: brightness, hue, saturation:
        bri.addEventListener('touchend', app.setBrightness, false);
        hue.addEventListener('touchend', app.setHue, false);
        sat.addEventListener('touchend', app.setSaturation, false);
        lightOn.addEventListener('change', app.setLightOn, false);
        lightNumber.addEventListener('change', app.getHueSettings, false);

        // buttons from the UI:
        modeButton.addEventListener('touchend', app.setMode, false);
        songName.addEventListener('change', app.setSong, false);
        playButton.addEventListener('touchend', app.toggleAudio, false);
        stopButton.addEventListener('touchend', app.stopAudio, false);

        // pause and resume functionality for the whole app:
        document.addEventListener('pause', this.onPause, false);
        document.addEventListener('resume', this.onResume, false);
    },
/*
    this runs when the device is ready for user interaction:
*/
    onDeviceReady: function() {
        app.clear();        // clear any messages onscreen

        // get the Hue's address
        app.findControllerAddress();    // find address and get settings
        app.setMode();              // set the read/write mode for tags

        nfc.addNdefFormatableListener(
            app.onNfc,                                  // tag successfully scanned
            function (status) {                         // listener successfully initialized
                app.display("Listening for NDEF-formatable tags.");
            },
            function (error) {                          // listener fails to initialize
                app.display("NFC reader failed to initialize " + JSON.stringify(error));
            }
        );

        nfc.addMimeTypeListener(
            app.mimeType,
            app.onNfc,
            function() { console.log("listening for mime media tags"); },
            function(error) { console.log("ERROR: " + JSON.stringify(error)); }
        );
    },

/*
    This is called when the app is paused
*/
    onPause: function() {
        if (app.musicState === Media.MEDIA_RUNNING) {
            app.pauseAudio();
        }
    },

/*
    This is called when the app is resumed
*/
    onResume: function() {
        if (app.musicState === Media.MEDIA_PAUSED) {
            app.startAudio();
        }
    },

    /*
        Set the tag read/write mode for the app:
    */
    setMode: function() {
        if (app.mode === "write") {     // change to read
            app.mode = "read";
            tagModeMessage.innerHTML = "Tap a tag to read its settings."
        } else {                        // change to write
            app.mode = "write";
            tagModeMessage.innerHTML = "Tap a tag to write the current settings to it."
        }
        modeValue.innerHTML = app.mode; // set text in the UI
    },
/*
    runs when an NDEF-formatted tag shows up.
*/
    onNfc: function(nfcEvent) {
        var tag = nfcEvent.tag;

        if (app.mode === "read") {
            app.readTag(tag);
        } else {
            app.makeMessage();
        }
    },

/*
    reads an NDEF-formatted tag.
*/
    readTag: function(thisTag) {
        var message = thisTag.ndefMessage,
            record,
            recordType,
            content;

        for (var thisRecord in message) {
            // get the next record in the message array:
            record = message[thisRecord];
            // parse the record:
            recordType = nfc.bytesToString(record.type);
            // if you've got a URI, use it to start a song:
            if (recordType === nfc.bytesToString(ndef.RTD_URI)) {
                // for some reason I have to cut the first byte of the payload
                // in order to get a playable URI:
                var trash = record.payload.shift();
                // convert the remainder of the payload to a string:
                content = nfc.bytesToString(record.payload);
                app.stopAudio();      // stop whatever is playing
                app.songPlaying = null; // clear the media object
                app.setSong(content); // set the song name
                app.startAudio();     // play the song
            }

            // if you've got a hue JSON object, set the lights:
            if (recordType === 'text/hue') {
                // tag should be TNF_MIME_MEDIA with a type 'text/hue'
                // assume we get a JSON object as the payload
                // JSON object should have valid settings info for the hue
                // http://developers.meethue.com/1_lightsapi.html
                // { "on": true }
                // { "on": false }

                content = nfc.bytesToString(record.payload);
                content = JSON.parse(content); // don't really need to parse
                app.setAllLights(content.lights);
              }
        }
    },

    setAllLights: function(settings) {
        for (thisLight in settings) {
            // set state
            app.putHueSettings(settings[thisLight].state, "state", thisLight);
        }
    },

    putHueSettings: function(settings, property, lightId) {
        // if they just send settings, assume they are the light state:
        if (!property) {
            property = "state";
        }

        // if no lightId is sent, assume the current light:
        if (!lightId) {
            lightId = hub.currentLight;
        }

        // set the property for the light:
        $.ajax({
            type: 'PUT',
            url: 'http://' + hub.ipaddress + '/api/' + hub.username + '/lights/' + lightId + '/' + property,
            data: JSON.stringify(settings),
            success: function(data){
                if (data[0].error) {
                    navigator.notification.alert(JSON.stringify(data), null, "API Error");
                }
            },
            error: function(xhr, type){
                navigator.notification.alert(xhr.responseText + " (" + xhr.status + ")", null, "Error");
            }
        });

    },

    /*
        Set the value of the UI controls using the values from the Hue:
    */
    setControls: function() {
        hub.currentLight = lightNumber.value;

        // set the names of the lights in the dropdown menu:
        // (in a more fully developed app, you might generalize this)
        lightNumber.options[0].innerHTML = hub.lights["1"].name;
        lightNumber.options[1].innerHTML = hub.lights["2"].name;
        lightNumber.options[2].innerHTML = hub.lights["3"].name;

        // set the state of the controls with the current choice:
        var thisLight = hub.lights[hub.currentLight];
        hue.value = thisLight.state.hue;
        bri.value = thisLight.state.bri;
        sat.value = thisLight.state.sat;
        lightOn.checked = thisLight.state.on;
      },

    /*
        These functions set the properties for a Hue light:
        Brightness, Hue, Saturation, and On State
    */
    setBrightness: function() {
        var thisBrightness = parseInt(bri.value);
        var thisLight = hub.lights[hub.currentLight];
        thisLight.state.bri = thisBrightness;
        app.putHueSettings( { "bri": thisBrightness } );
    },

    setHue: function() {
        var thisHue = parseInt(hue.value);
        var thisLight = hub.lights[hub.currentLight];
        thisLight.state.hue = thisHue;
        app.putHueSettings( { "hue": thisHue } );
    },

    setSaturation: function() {
        var thisSaturation = parseInt(bri.value);
        var thisLight = hub.lights[hub.currentLight];
        thisLight.state.sat = thisSaturation;
        app.putHueSettings( { "sat": thisSaturation } );
    },

    setLightOn: function() {
        var thisOn = lightOn.checked;
        var thisLight = hub.lights[hub.currentLight];
        thisLight.state.on = thisOn;
        app.putHueSettings( { "on": thisOn } );
    },

    /*
        Get the settings from the Hue and store a subset of them locally
        in hub.lights.  This is for both setting the controls, and so you
        have an object to write to a tag:
    */
    getHueSettings: function() {
        // query the hub and get its current settings:

        $.ajax({
            type: 'GET',
            url: 'http://' + hub.ipaddress + '/api/' + hub.username,
            success: function(data) {
                if (!data.lights) {
                    // assume they need to authorize
                    app.ensureAuthorized();
                } else {
                    // the full settings take more than you want to
                    // fit on a tag, so just get the settings you want:
                    for (thisLight in data.lights) {
                        hub.lights[thisLight] = {};
                        hub.lights[thisLight]["name"] = data.lights[thisLight].name;
                        hub.lights[thisLight]["state"] = {};
                        hub.lights[thisLight].state.on = data.lights[thisLight].state.on;
                        hub.lights[thisLight].state.bri = data.lights[thisLight].state.bri;
                        hub.lights[thisLight].state.hue = data.lights[thisLight].state.hue;
                        hub.lights[thisLight].state.sat = data.lights[thisLight].state.sat;
                    }
                    app.setControls();
                }
            }
        });
    },

    /*
        Find the Hue controller address and get its settings
    */

    findControllerAddress: function() {
        $.ajax({
            url: 'http://www.meethue.com/api/nupnp',
            dataType: 'json',
            success: function(data) {
                // expecting a list with a property called internalipaddress
                if (data[0]) {
                    hub.ipaddress = data[0].internalipaddress;
                    app.getHueSettings();   // copy the Hue settings locally
               } else {
                    navigator.notification.alert("Couldn't find a Hue on your network");
                }
            },
            error: function(xhr, type){
                navigator.notification.alert(xhr.responseText + " (" + xhr.status + ")", null, "Error");
            }
        });
    },

    ensureAuthorized: function() {
        var message;

        $.ajax({
            type: 'GET',
            url: 'http://' + hub.ipaddress + '/api/' + hub.username,
            success: function(data){
                if (data[0].error) {
                    // if not authorized, users gets an alert box
                    if (data[0].error.type === 1) {
                        message = "Press link button on the hub.";
                    } else {
                        message = data[0].error.description;
                    }
                    navigator.notification.alert(message, app.authorize, "Not Authorized");
                }
            },
            error: function(xhr, type){
                navigator.notification.alert(xhr.responseText + " (" + xhr.status + ")", null, "Error");
            }
        });
    },

    authorize: function() { // could probably be combined with ensureAuthorized

        var data = { "devicetype": hub.appTitle, "username": hub.username },
            message;

        $.ajax({
            type: 'POST',
            url: 'http://' + hub.ipaddress + '/api',
            data: JSON.stringify(data),
            success: function(data){
                if (data[0].error) {
                    // if not authorized, users gets an alert box
                    if (data[0].error.type === 101) {
                        message = "Press link button on the hub, then tap OK.";
                    } else {
                        message = data[0].error.description;
                    }
                    navigator.notification.alert(message, app.authorize, "Not Authorized");
                } else {
                    navigator.notification.alert("Authorized user " + hub.username)
                    app.getHueSettings();
                }
            },
            error: function(xhr, type){
                navigator.notification.alert(xhr.responseText + " (" + xhr.status + ")", null, "Error");
            }
        });
    },

    // song audio
    startAudio: function() {
        var success = false;
        // attempt to instantiate a song:
        if (app.songPlaying === null) {
            // Create Media object from songTitle
            if (app.songTitle) {
                songPath = app.musicPath + app.songTitle;
                app.songPlaying = new Media(
                    songPath,           // filepath of song to play
                    app.audioSuccess,   // success callback
                    app.audioError,     // error callback
                    app.audioStatus     // update the status  callback
                );
            } else {
                console.log("Pick a song!")
            }
        }

        // play the song:
        app.playAudio();
    },

    audioSuccess: function() {
        console.log("Success; starting audio");
        app.clear();
        app.display("Currently playing: " + app.songTitle)
    },

    audioError: function(error) {
        console.log("error starting audio callback: " + JSON.stringify(error) );
    },

    toggleAudio: function(event) {
        switch(app.musicState) {
            case undefined:
            case Media.MEDIA_NONE:
                app.startAudio();
                break;
            case Media.MEDIA_STARTING:
                state = "music starting";
                break;
            case Media.MEDIA_RUNNING:
                app.pauseAudio();
                break;
            case Media.MEDIA_PAUSED:
            case Media.MEDIA_STOPPED:
                app.playAudio();
                break;
        }

    },

    playAudio: function() {
        if (app.songPlaying) {
            app.songPlaying.play();
            playButton.innerHTML = "Pause";
        }
    },

    pauseAudio: function() {
        if (app.songPlaying) {
            app.songPlaying.pause();
            playButton.innerHTML = "Play";
        }
    },

    stopAudio: function() {
         if (app.songPlaying) {
            app.songPlaying.stop();
            playButton.innerHTML = "Play";
        }
    },

    setSong: function(content) {
        // if there's no song title given,
        // check the songName file picker for a title:
        if (typeof(content) !== 'string' ) {
            // get rid of the standard c:\fakepath beginning
            // that the HTML file input object adds:
            content = songName.value.replace("C:\\fakepath\\", "");
        }

        // if you have a song title now, and it's not the current one:
        if (typeof(content) === 'string' && content !== app.songTitle) {
            app.songTitle = content;        // change the song title
        }
    },

    audioStatus: function(status) {
       var state;
       app.musicState = status;

        switch(status) {
            case Media.MEDIA_NONE:
                state = "none";
                break;
            case Media.MEDIA_STARTING:
                state = "music starting";
                break;
            case Media.MEDIA_RUNNING:
                state = "music running";
                break;
            case Media.MEDIA_PAUSED:
                state = "music paused";
                break;
            case Media.MEDIA_STOPPED:
                state = "music stopped";
                break;
        }
    },

/*
    appends @message to the message div:
*/
    display: function(message) {
        var display = document.getElementById("message"),   // the div you'll write to
            label,                                          // what you'll write to the div
            lineBreak = document.createElement("br");       // a line break

        label = document.createTextNode(message);           // create the label
        display.appendChild(lineBreak);                     // add a line break
        display.appendChild(label);                         // add the message node
    },
/*
    clears the message div:
*/
    clear: function() {
        var display = document.getElementById("message");
        display.innerHTML = "";
    },

/*
    makes an NDEF message and calls writeTag() to write it to a tag:
*/
    makeMessage: function() {
        var message = [];

        // put the record in the message array:
        if (hub.lights !== {}) {
            var huePayload = JSON.stringify({"lights": hub.lights});
            var lightRecord = ndef.mimeMediaRecord(app.mimeType, huePayload);
            message.push(lightRecord);
        }
        if (app.songTitle !== null) {
            var songRecord = ndef.uriRecord(app.songTitle);
            message.push(songRecord);
        }

        //write the message:
        app.writeTag(message);
    },

/*
    writes NDEF message @message to a tag:
*/
    writeTag: function(message) {
        // write the record to the tag:
        nfc.write(
            message,						// write the record itself to the tag
            function () {					// when complete, run this callback function:
                app.clear();                            // clear the message div
                app.display("Wrote data to tag.");		// notify the user in message div
                navigator.notification.vibrate(100);	// vibrate the device as well
            },
            function (reason) {				// this function runs if the write command fails
                navigator.notification.alert(reason, function() {}, "There was a problem");
            }
        );
    }
};          // end of app
