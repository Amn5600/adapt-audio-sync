define([
   'core/js/adapt'
], function(Adapt) {

    var AudioControlsView = Backbone.View.extend({

        className: "audio-controls",

        initialize: function() {
          this.listenTo(Adapt, {
              "remove": this.remove,
              "device:changed": this.setAudioFile,
              "popup:opened": this.popupOpened,
              "audio:updateAudioStatus": this.updateToggle
          });

          this.listenToOnce(Adapt, "remove", this.removeInViewListeners);

          this.listenTo(this.model.get('_children'), 'change:_isActive', this.onItemsActiveChange);

          this.listenTo(this.model, 'change:_feedbackBand', this.setAudioFile);

          this.render();
        },

        events: {
            'click .audio-toggle': 'toggleAudio'
        },

        render: function() {
            var data = this.model.toJSON();
            var template = Handlebars.templates["audioControls"];

            if (this.model.get('_audio')._location == "bottom-left" || this.model.get("_audio")._location == "bottom-right") {
              $(this.el).html(template(data)).appendTo('.' + this.model.get('_id') + " > ." + this.model.get("_type") + "-inner");
            } else {
              $(this.el).html(template(data)).prependTo('.' + this.model.get("_id") + " > ." + this.model.get("_type") + "-inner");
            }
            // Add class so it can be referenced in the theme if needed
            $(this.el).addClass(this.model.get("_type") + "-audio");

            // Set vars
            this.audioChannel = this.model.get('_audio')._channel;
            this.elementId = this.model.get("_id");
            this.audioIcon = Adapt.audio.iconPlay;
            this.pausedTime = 0;
            this.onscreenTriggered = false;
            this.popupIsOpen = false;

            // Sound effects
            var audioFeedbackModel = new Backbone.Model(this.model.get('_audio')._feedback);
            if (audioFeedbackModel.has('_soundEffect')) {
              this.audioEffectsEnabled = this.model.get('_audio')._feedback._soundEffect._isEnabled;
              this.audioEffectsChannel = 1;
              this.audioEffectsFile = "";
            } else {
              this.audioEffectsEnabled = false;
            }

            // Autoplay
            if (Adapt.audio.autoPlayGlobal || this.model.get("_audio")._autoplay) {
                this.canAutoplay = true;
            } else {
                this.canAutoplay = false;
            }

            // Autoplay once
            if (Adapt.audio.autoPlayOnceGlobal || this.model.get("_audio")._autoPlayOnce) {
                this.autoplayOnce = true;
            } else {
                this.autoplayOnce = false;
            }

            // Add audio icon
            this.$('.audio-toggle').addClass(this.audioIcon);

            this.updateToggle();

            // Set audio file
            this.setAudioFile();

            // Set clip ID
            Adapt.audio.audioClip[this.audioChannel].newID = this.elementId;

            // Set listener for when clip ends
            $(Adapt.audio.audioClip[this.audioChannel]).on('ended', _.bind(this.onAudioEnded, this));

            _.defer(_.bind(function() {
                this.postRender();
            }, this));
        },

        postRender: function() {
          // Add inview listener on audio element
          $('.'+this.model.get('_id')).on('onscreen', _.bind(this.onscreen, this));
        },

        setAudioFile: function() {
          // Check if the results feature is enabled
          if (this.model.get("_audio")._results && this.model.get("_audio")._results._isEnabled) {

            var state = this.model.get('_state');
            if (!Adapt.assessment || state === undefined) return;

            this.setFeedbackAudio(state);
            this.audioFile = this.model.get("_feedbackAudio")._src;

          } else {
            // Set audio file based on the device size
            if (Adapt.device.screenSize === 'large') {
              this.audioFile = this.model.get("_audio")._media.desktop;
            } else {
              this.audioFile = this.model.get("_audio")._media.mobile;
            }
          }
        },

        setFeedbackAudio: function(state) {
          var scoreProp = state.isPercentageBased ? 'scoreAsPercent' : 'score';
          var bands = _.sortBy(this.model.get('_audio')._results._bands, '_score');

          for (var i = (bands.length - 1); i >= 0; i--) {
            var isScoreInBandRange = (state[scoreProp] >= bands[i]._score);
            if (!isScoreInBandRange) continue;

            this.model.set('_feedbackAudio', bands[i]);
            break;
          }
        },

        onAudioEnded: function() {
          Adapt.trigger('audio:audioEnded', this.audioChannel);
        },

        popupOpened: function() {
          this.popupIsOpen = true;
        },

        onscreen: function(event, measurements) {
            if (this.popupIsOpen) return;

            var visible = this.model.get('_isVisible');
            var isOnscreenY = measurements.percentFromTop < Adapt.audio.triggerPosition && measurements.percentFromTop > 0;
            var isOnscreenX = measurements.percentInviewHorizontal == 100;
            var isOnscreenVertical = measurements.percentInviewVertical == 100;
            var isOnscreen = measurements.onscreen;

            // Check for element coming on screen
            if (visible && (isOnscreenY || isOnscreenVertical) && isOnscreenX && this.canAutoplay && this.onscreenTriggered == false) {
              // Check if audio is set to on
              if (Adapt.audio.audioClip[this.audioChannel].status == 1) {
                this.setAudioFile();
                Adapt.trigger('audio:playAudio', this.audioFile, this.elementId, this.audioChannel);
              }
              // Set to false to stop autoplay when onscreen again
              if (this.autoplayOnce) {
                this.canAutoplay = false;
              }
              // Set to true to stop onscreen looping
              this.onscreenTriggered = true;
            }
            // Check when element is off screen
            if (visible && isOnscreen == false) {
              this.onscreenTriggered = false;
              Adapt.trigger('audio:onscreenOff', this.elementId, this.audioChannel);
            }
        },

        toggleAudio: function(event) {
            if (event) event.preventDefault();
            this.setAudioFile();
            Adapt.audio.audioClip[this.audioChannel].onscreenID = "";
            if ($(event.currentTarget).hasClass('playing')) {
              this.pauseAudio();
            } else {
              this.playAudio();
            }
        },

        playAudio: function() {
          // iOS requires direct user interaction on a button to enable autoplay
          // Re-use code from main adapt-audio.js playAudio() function

          // Stop audio
          Adapt.audio.audioClip[this.audioChannel].pause();
          Adapt.audio.audioClip[this.audioChannel].isPlaying = false;
          // Update previous player
          if (Adapt.audio.audioClip[this.audioChannel].playingID !== "") {
            $('#'+Adapt.audio.audioClip[this.audioChannel].playingID).removeClass(Adapt.audio.iconPause);
            $('#'+Adapt.audio.audioClip[this.audioChannel].playingID).addClass(Adapt.audio.iconPlay);
            $('#'+Adapt.audio.audioClip[this.audioChannel].playingID).removeClass('playing');
          }

          this.$('.audio-toggle').removeClass(Adapt.audio.iconPlay);
          this.$('.audio-toggle').addClass(Adapt.audio.iconPause);
          this.$('.audio-toggle').addClass('playing');

          Adapt.audio.audioClip[this.audioChannel].prevID = Adapt.audio.audioClip[this.audioChannel].playingID;
          Adapt.audio.audioClip[this.audioChannel].src = this.audioFile;

          // Check for items (Narrative component etc) that set a "_stage" attribute
          if (this.model.get('_items')) {
            var itemNumber = this.model.has('_stage') ? this.model.get('_stage') : 0;
            var currentItem = this.model.get('_items')[itemNumber];
            if (itemNumber > 0) {
              Adapt.audio.audioClip[this.audioChannel].src = currentItem._audio.src;
            }
          }

          Adapt.audio.audioClip[this.audioChannel].newID = this.elementId;

          if (Adapt.audio.pauseStopAction == "pause") {
            Adapt.audio.audioClip[this.audioChannel].play(this.pausedTime);
          } else {
            Adapt.audio.audioClip[this.audioChannel].play();
          }

          Adapt.audio.audioClip[this.audioChannel].onscreenID = this.elementId;
          Adapt.audio.audioClip[this.audioChannel].playingID = Adapt.audio.audioClip[this.audioChannel].newID;
          Adapt.audio.audioClip[this.audioChannel].isPlaying = true;
          Adapt.audio.autoPlayOnIOS = true;
        },

        pauseAudio: function() {
            if (Adapt.audio.pauseStopAction == "pause") {
                this.pausedTime = Adapt.audio.audioClip[this.audioChannel].currentTime;
                Adapt.audio.audioClip[this.audioChannel].pause();
                Adapt.audio.audioClip[this.audioChannel].isPlaying = false;
                this.$('.audio-toggle').removeClass(Adapt.audio.iconPause);
                this.$('.audio-toggle').addClass(Adapt.audio.iconPlay);
                this.$('.audio-toggle').removeClass('playing');
            } else {
                Adapt.trigger('audio:pauseAudio', this.audioChannel);
            }
        },

        updateToggle: function() {
          // Reset width
            var width = 0;

            if (Adapt.audio.audioClip[this.audioChannel].status == 1 && this.model.get('_audio')._showControls == true) {
                this.$('.audio-inner button').show();
                width = this.$('.audio-toggle').outerWidth();
            } else {
                this.$('.audio-inner button').hide();
            }

            var direction = "right";
            if (Adapt.config.get('_defaultDirection') == 'rtl') {
                direction = "left";
            }

            // Set padding on title or body
            if (this.model.get('displayTitle') == "") {
              $('.'+this.elementId).find('.'+this.model.get("_type")+'-body-inner').css("padding-"+direction, width);
            } else {
              $('.'+this.elementId).find('.'+this.model.get("_type")+'-title-inner').css("padding-"+direction, width);
            }
        },

        onItemsActiveChange: function(item, _isActive) {
          if (_isActive === true) {
            var itemIndex = item.get('_index');

            this.audioFile = this.model.get("_audio")._items[itemIndex]._src;

            if (Adapt.audio.audioClip[this.audioChannel].status == 1) {
              // Reset onscreen id
              Adapt.audio.audioClip[this.model.get('_audio')._channel].onscreenID = "";
              Adapt.trigger('audio:playAudio', this.audioFile, this.elementId, this.audioChannel);
            }
          }
        },

        removeInViewListeners: function() {
            $('.'+this.model.get('_id')).off('onscreen');
        }

    });

    return AudioControlsView;

});
