define([
    'core/js/adapt',
    './audioNavigationView',
    './audioDrawerView',
    './audioMenuView',
    './audioControlsView',
    './audioFeedbackView'
], function(Adapt, AudioNavigationView, AudioDrawerView, AudioMenuView, AudioControlsView, AudioFeedbackView) {

  var AudioController = _.extend({

    initialize: function() {
        this.listenToOnce(Adapt, "app:dataReady", this.onDataReady);
    },

    onDataReady: function() {
      if (Adapt.course.get("_audio") && Adapt.course.get("_audio")._isEnabled) {
        this.setupEventListeners();
        this.setupAudio();
        this.addAudioDrawerItem();
      }
    },

    setupEventListeners: function() {
      this.listenToOnce(Adapt, {
          "router:location": this.checkLaunch,
          "bookmarking:cancel": this.promptClosed
      });
      // Add VIEW listeners
      this.listenTo(Adapt, {
          "navigationView:postRender": this.onAddToggle,
          "menuView:preRender": this.stopAllChannels,
          "menuView:postRender": this.onMenuReady,
          "pageView:preRender": this.stopAllChannels,
          "articleView:postRender": this.onABCReady,
          "blockView:postRender": this.onABCReady,
          "componentView:postRender": this.onABCReady,
          "questionView:showFeedback": this.onShowFeedback
      });
      // Add Audio specific listeners
      this.listenTo(Adapt, {
          "audio:onscreenOff": this.onscreenOff,
          "audio:playAudio": this.playAudio,
          "audio:pauseAudio": this.pauseAudio,
          "audio:stopAllChannels": this.stopAllChannels,
          "audio:audioEnded": this.audioEnded,
          "audio:updateAudioStatus": this.updateAudioStatus,
          "audio:showAudioDrawer": this.setupDrawerAudio,
          "audio:popupOpened": this.popupOpened,
          "audio:popupClosed": this.popupClosed
      });

      // Listen for language change
      this.listenTo(Adapt.config, 'change:_activeLanguage', this.onLangChange);
      // Listen for notify closing
      this.listenTo(Adapt, 'notify:closed', this.notifyClosed);
    },

    setupAudio: function() {

      this.config = Adapt.course.get('_audio');
      // Define audio model for all other views and components to reference
      Adapt.audio = {};
      Adapt.audio.audioClip = [];

      // Set variables to be used for the initial prompt event
      Adapt.audio.promptIsOpen = false;
      Adapt.audio.externalPromptIsOpen = false;

      // Set action for the pause button
      Adapt.audio.pauseStopAction = this.config._pauseStopAction;

      // Set trigger position for onscreen percentFromTop detection
      Adapt.audio.triggerPosition = this.config._triggerPosition;

      // Set global variables based on course JSON
      Adapt.audio.autoPlayGlobal = this.config._autoplay ? true : false;
      Adapt.audio.autoPlayOnceGlobal = this.config._autoPlayOnce ? true : false;

      // Set variable for iOS devices
      // When false - autoplay will be disabled until the user clicks on the audio control icon
      Adapt.audio.autoPlayOnIOS = false;

      // Check if iOS is being used
      if (navigator.userAgent.match(/iPad/i) || navigator.userAgent.match(/iPhone/i)) {
        Adapt.audio.autoPlayOnIOS = false;
      } else {
        Adapt.audio.autoPlayOnIOS = true;
      }

      // Get names for icons from course.config
      Adapt.audio.iconOn = this.config._icons._audioOn;
      Adapt.audio.iconOff = this.config._icons._audioOff;
      Adapt.audio.iconPlay = this.config._icons._audioPlay;
      Adapt.audio.iconPause = this.config._icons._audioPause;

      // Set number of audio channels specified in the course JSON
      Adapt.audio.numChannels = 3;
      // Create audio objects based on the number of channels
      for (var i = 0; i < Adapt.audio.numChannels; i++) {
        Adapt.audio.audioClip[i] = new Audio();
      }

      // Assign variables to each audio object
      for (var i = 0; i < Adapt.audio.numChannels; i++) {
        Adapt.audio.audioClip[i].isPlaying = false;
        Adapt.audio.audioClip[i].playingID = "";
        Adapt.audio.audioClip[i].newID = "";
        Adapt.audio.audioClip[i].prevID = "";
        Adapt.audio.audioClip[i].onscreenID = "";
      }

      //Set default audio status for each channel base on the course config
      Adapt.audio.audioClip[0].status = this.config._channels._narration._status;
      Adapt.audio.audioClip[1].status = this.config._channels._effects._status;
      Adapt.audio.audioClip[2].status = this.config._channels._music._status;
      Adapt.audio.audioStatus = Adapt.audio.audioClip[0].status;

      // Collect data from offline storage
      if(Adapt.offlineStorage.get("audio_level") == "1" || Adapt.offlineStorage.get("audio_level") == "0") {
        // Set to saved audio status
        Adapt.audio.audioStatus = Adapt.offlineStorage.get("audio_level");
      }
      // Update channels based on preference
      for (var i = 0; i < Adapt.audio.numChannels; i++) {
        Adapt.audio.audioClip[i].status = parseInt(Adapt.audio.audioStatus);
      }
      // Change audio status based on preference
      this.updateAudioStatus(0,Adapt.audio.audioStatus);
    },

    onAddToggle: function(navigationView) {
      var audioModel = this.config;
      var audioToggleModel = new Backbone.Model(audioModel);
      navigationView.$('.navigation-drawer-toggle-button').after(new AudioNavigationView({
        model: audioToggleModel
      }).$el);
    },

    checkLaunch: function() {
      // Check launch based on the saved location
      if((Adapt.offlineStorage.get("location") === "undefined") || (Adapt.offlineStorage.get("location") === undefined) || (Adapt.offlineStorage.get("location") == "")) {
        if (this.config._prompt._isEnabled) {
          this.showAudioPrompt();
        } else {
          this.audioConfigured();
        }
      } else {
        // Check for bookmark
        if (Adapt.course.has('_bookmarking') && Adapt.course.get('_bookmarking')._isEnabled && Adapt.course.get('_bookmarking')._showPrompt) {
          // Check if bookmark has already been triggered
          if ($('body').children('.notify').css('visibility') == 'visible') {
            this.bookmarkOpened();
          } else {
            this.listenToOnce(Adapt, 'popup:opened', this.bookmarkOpened);
          }
        }
      }
    },

    bookmarkOpened: function() {
      Adapt.audio.promptIsOpen = true;
    },

    onLangChange: function() {
      this.listenToOnce(Adapt, "app:dataReady", this.onDataChanged);
    },

    onDataChanged: function() {
      this.config = Adapt.course.get('_audio');
      // Set variable to be used for the initial prompt event
      Adapt.audio.promptIsOpen = false;

      // Set action for the pause button
      Adapt.audio.pauseStopAction = this.config._pauseStopAction;

      // Set trigger position for onscreen percentFromTop detection
      Adapt.audio.triggerPosition = this.config._triggerPosition;

      // Set global variables based on course JSON
      Adapt.audio.autoPlayGlobal = this.config._autoplay ? true : false;
      Adapt.audio.autoPlayOnceGlobal = this.config._autoPlayOnce ? true : false;

      // Get names for icons from course.config
      Adapt.audio.iconOn = this.config._icons._audioOn;
      Adapt.audio.iconOff = this.config._icons._audioOff;
      Adapt.audio.iconPlay = this.config._icons._audioPlay;
      Adapt.audio.iconPause = this.config._icons._audioPause;

      // Assign variables to each audio object
      for (var i = 0; i < Adapt.audio.numChannels; i++) {
        Adapt.audio.audioClip[i].isPlaying = false;
        Adapt.audio.audioClip[i].playingID = "";
        Adapt.audio.audioClip[i].newID = "";
        Adapt.audio.audioClip[i].prevID = "";
        Adapt.audio.audioClip[i].onscreenID = "";
      }

      //Set default audio status for each channel base on the course config
      Adapt.audio.audioClip[0].status = this.config._channels._narration._status;
      Adapt.audio.audioClip[1].status = this.config._channels._effects._status;
      Adapt.audio.audioClip[2].status = this.config._channels._music._status;
      Adapt.audio.audioStatus = Adapt.audio.audioClip[0].status;

      // Collect data from offline storage
      if(Adapt.offlineStorage.get("audio_level") == "1" || Adapt.offlineStorage.get("audio_level") == "0") {
        // Set to saved audio status
        Adapt.audio.audioStatus = Adapt.offlineStorage.get("audio_level");
      }
      // Update channels based on preference
      for (var i = 0; i < Adapt.audio.numChannels; i++) {
        Adapt.audio.audioClip[i].status = parseInt(Adapt.audio.audioStatus);
      }
      // Change audio status based on preference
      this.updateAudioStatus(0,Adapt.audio.audioStatus);

      Adapt.offlineStorage.set("location", "");
      this.listenToOnce(Adapt, "router:location", this.checkLaunch);
    },

    showAudioPrompt: function() {
      Adapt.audio.promptIsOpen = true;

      var promptModel = this.config._prompt;

      this.listenToOnce(Adapt, "audio:selectContinueAudioOn", this.setContinueAudioOn);
      this.listenToOnce(Adapt, "audio:selectContinueAudioOff", this.setContinueAudioOff);

      this.listenToOnce(Adapt, "audio:selectOff", this.setAudioOff);
      this.listenToOnce(Adapt, "audio:selectOn", this.setAudioOn);

      var headerIcon = "<div class='audio-prompt-icon icon "+Adapt.audio.iconOn+"'></div>";

      // If audio is off
      if(Adapt.audio.audioStatus == 0) {
        var promptObject = {
          title: headerIcon+promptModel.title,
          body: promptModel.bodyAudioOff,
          _prompts:[
              {
                  promptText: promptModel._buttons.continue,
                  _callbackEvent: "audio:selectContinueAudioOff",
              },
              {
                  promptText: promptModel._buttons.turnOn,
                  _callbackEvent: "audio:selectOn",
              }
          ],
          _showIcon: false
        }
      } else {
        var promptObject = {
          title: headerIcon+promptModel.title,
          body: promptModel.bodyAudioOn,
          _prompts:[
              {
                  promptText: promptModel._buttons.continue,
                  _callbackEvent: "audio:selectContinueAudioOn",
              },
              {
                  promptText: promptModel._buttons.turnOff,
                  _callbackEvent: "audio:selectOff",
              }
          ],
          _showIcon: false
        }
      }
      promptObject._classes = "audio";
      Adapt.trigger('notify:prompt', promptObject);
    },

    setContinueAudioOn: function() {
      this.audioConfigured();
      this.updatePromptStatus();
      Adapt.audio.audioStatus = 1;
      Adapt.audio.autoPlayOnIOS = true;
      this.stopListening(Adapt, "audio:selectContinueAudioOn");
      this.promptClosed();
    },

    setContinueAudioOff: function() {
      this.audioConfigured();
      this.updatePromptStatus();
      Adapt.audio.audioStatus = 0;
      Adapt.audio.autoPlayOnIOS = true;
      this.stopListening(Adapt, "audio:selectContinueAudioOn");
    },

    setAudioOff: function() {
      this.audioConfigured();
      Adapt.audio.audioStatus = 0;
      Adapt.audio.autoPlayOnIOS = true;
      for (var i = 0; i < Adapt.audio.numChannels; i++) {
        Adapt.audio.audioClip[i].status = parseInt(Adapt.audio.audioStatus);
      }
      Adapt.trigger('audio:updateAudioStatus', 0,0);
      this.stopListening(Adapt, "audio:selectOff");
      this.promptClosed();
    },

    setAudioOn: function() {
      this.audioConfigured();
      Adapt.audio.audioStatus = 1;
      Adapt.audio.autoPlayOnIOS = true;
      for (var i = 0; i < Adapt.audio.numChannels; i++) {
        Adapt.audio.audioClip[i].status = parseInt(Adapt.audio.audioStatus);
      }
      Adapt.trigger('audio:updateAudioStatus', 0,1);
      this.stopListening(Adapt, "audio:selectOn");
      this.promptClosed();
    },

    playCurrentAudio: function(channel){
      if(Adapt.audio.audioClip[channel].status == 1) {
        Adapt.audio.audioClip[channel].play();
        Adapt.audio.audioClip[channel].isPlaying = true;
        this.showAudioIcon(channel);
      }
    },

    onscreenOff: function(id, channel){
      if(id == Adapt.audio.audioClip[channel].playingID){
        Adapt.audio.audioClip[channel].onscreenID = "";
        this.pauseAudio(channel);
      }
    },

    playAudio: function(audioClip, id, channel, popup) {
      if (audioClip == "") return;
      if (Adapt.audio.audioClip[channel].onscreenID != id || id === null) {
        Adapt.trigger('media:stop');
        // Stop audio
        Adapt.audio.audioClip[channel].pause();
        // Update previous player
        this.hideAudioIcon(channel);
        Adapt.audio.audioClip[channel].prevID = Adapt.audio.audioClip[channel].playingID;
        // Update player to new clip vars
        Adapt.audio.audioClip[channel].src = audioClip;
        Adapt.audio.audioClip[channel].newID = id;
        // Only play if prompt is not open or the audio type is a popup
        if ((Adapt.audio.promptIsOpen == false || popup == true) && Adapt.audio.autoPlayOnIOS) {
          var delay = 500;
          if (id === null) {
            delay = 0;
          }
          setTimeout(function() {
            Adapt.audio.audioClip[channel].play();
            Adapt.audio.audioClip[channel].isPlaying = true;
          },delay);

          if (id != null) {
            this.showAudioIcon(channel);
          }
        }
        Adapt.audio.audioClip[channel].onscreenID = id;
        // Update player ID to new clip
        Adapt.audio.audioClip[channel].playingID = Adapt.audio.audioClip[channel].newID;
      }
    },

    pauseAudio: function(channel) {
      if (!Adapt.audio.audioClip[channel].paused) {
        Adapt.audio.audioClip[channel].isPlaying = false;
        Adapt.audio.audioClip[channel].pause();
        this.hideAudioIcon(channel);
      }
    },

    audioEnded: function(channel) {
      Adapt.audio.audioClip[channel].isPlaying = false;
      this.hideAudioIcon(channel);
    },

    notifyClosed: function() {
      this.stopAllChannels();
      Adapt.audio.promptIsOpen = false;
    },

    promptClosed: function() {
      this.stopAllChannels();
      this.updatePromptStatus();
      Adapt.audio.audioClip[0].onscreenID = "";
      if(Adapt.audio.audioClip[0].status == 1) {
        this.playAudio(Adapt.audio.audioClip[0].src, Adapt.audio.audioClip[0].playingID, 0);
      }
    },

    popupOpened: function() {
      this.stopAllChannels();
      Adapt.audio.promptIsOpen = true;
      Adapt.audio.externalPromptIsOpen = true;
    },

    popupClosed: function() {
      this.stopAllChannels();
      Adapt.audio.promptIsOpen = false;
      Adapt.audio.audioClip[0].onscreenID = "";
    },

    updatePromptStatus: function() {
      if (Adapt.audio.externalPromptIsOpen == true) {
        Adapt.audio.promptIsOpen = true;
      } else {
        Adapt.audio.promptIsOpen = false;
      }
    },

    stopAllChannels: function() {
      // Pause all channels
      for (var i = 0; i < Adapt.audio.numChannels; i++) {
        this.pauseAudio(i);
      }
    },

    showAudioIcon: function(channel) {
      var audioHTMLId = '#'+Adapt.audio.audioClip[channel].newID;
      $(audioHTMLId).removeClass(Adapt.audio.iconPlay);
      $(audioHTMLId).addClass(Adapt.audio.iconPause);
      $(audioHTMLId).addClass('playing');
    },

    hideAudioIcon: function(channel) {
      if (Adapt.audio.audioClip[channel].playingID == "") return;

      $('#'+Adapt.audio.audioClip[channel].playingID).removeClass(Adapt.audio.iconPause);
      $('#'+Adapt.audio.audioClip[channel].playingID).addClass(Adapt.audio.iconPlay);
      $('#'+Adapt.audio.audioClip[channel].playingID).removeClass('playing');
    },

    updateAudioStatus: function(channel, value) {
      Adapt.audio.audioClip[channel].status = value;
      // Pause audio channel
      Adapt.trigger('audio:pauseAudio', channel);
      // Set to off
      Adapt.audio.audioStatus = 0;
      // Check for narration channel being on
      if(Adapt.audio.audioClip[0].status == 1){
        Adapt.audio.audioStatus = 1;
      }
      this.updateOfflineStorage();
    },

    updateOfflineStorage: function() {
      Adapt.offlineStorage.set("audio_level", Adapt.audio.audioStatus);
    },

    audioConfigured: function() {
      Adapt.trigger('audio:configured');
    },

    addAudioDrawerItem: function() {
      var drawerObject = {
        title: this.config.title,
        description: this.config.description,
        className: 'audio-drawer',
        drawerOrder: this.config._drawerOrder || 0
      };
      Adapt.drawer.addItem(drawerObject, 'audio:showAudioDrawer');
    },

    setupDrawerAudio: function() {
      var audioDrawerModel = new Backbone.Model(this.config);

      Adapt.drawer.triggerCustomView(new AudioDrawerView({
        model: audioDrawerModel
      }).$el);
    },

    onMenuReady: function(view) {
      if (view.model && view.model.get("_audio") && view.model.get('_type') == "menu" && view.model.get("_audio")._isEnabled) {
        this.stopAllChannels();
        new AudioMenuView({model:view.model});
      }
    },

    onABCReady: function(view) {
      if (view.model && view.model.get("_audio") && view.model.get("_audio")._isEnabled) {
        this.stopAllChannels();
        new AudioControlsView({model:view.model});
      }
    },

    onShowFeedback: function(view) {
      if (view.model && view.model.get("_audio") && view.model.get("_audio")._isEnabled && view.model.get("_audio")._feedback._isEnabled) {
        this.stopAllChannels();
        new AudioFeedbackView({model: view.model});
      }
    }

  }, Backbone.Events);

    AudioController.initialize();

    return AudioController;
});
