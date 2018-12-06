define([
   'core/js/adapt'
], function(Adapt) {

    var AudioFeedbackView = Backbone.View.extend({

        initialize: function() {
          this.listenTo(Adapt, 'remove', this.remove);
          this.render();
        },

        render: function() {
          // Set vars
          this.audioChannel = this.model.get('_audio')._channel;
          this.elementId = this.model.get("_id");
          // Reset onscreen id
          Adapt.audio.audioClip[this.audioChannel].onscreenID = "";
          // Sound effects
          var audioFeedbackModel = new Backbone.Model(this.model.get('_audio')._feedback);
          if (audioFeedbackModel.has('_soundEffect')) {
            this.audioEffectsEnabled = this.model.get('_audio')._feedback._soundEffect._isEnabled;
            this.audioEffectsChannel = 1;
            this.audioEffectsFile = "";
          } else {
            this.audioEffectsEnabled = false;
          }
          // Set clip ID
          Adapt.audio.audioClip[this.audioChannel].newID = this.elementId;
          // Set listener for when clip ends
          $(Adapt.audio.audioClip[this.audioChannel]).on('ended', _.bind(this.onAudioEnded, this));

          this.initAudio();
        },

        initAudio: function() {
          // Correct
          if (this.model.get('_isCorrect')) {
            this.setupCorrectFeedback();
            // Partly correct
          } else if (this.model.get('_isAtLeastOneCorrectSelection')) {
            this.setupPartlyCorrectFeedback();
            // Incorrect
          } else {
            this.setupIncorrectFeedback();
          }

          if (Adapt.audio.audioClip[this.audioChannel].status == 1) {
            Adapt.trigger('audio:playAudio', this.audioFile, this.elementId, this.audioChannel);
          }

          // Effects audio
          if (this.audioEffectsEnabled && Adapt.audio.audioClip[this.audioEffectsChannel].status == 1) {
            Adapt.trigger('audio:playAudio', this.audioEffectsFile, null, this.audioEffectsChannel);
          }
        },

        onAudioEnded: function() {
          Adapt.trigger('audio:audioEnded', this.audioChannel);
        },

        setupCorrectFeedback: function() {
          this.audioFile = this.model.get('_audio')._feedback._correct._correct;
          // Effects audio
          if (this.audioEffectsEnabled) {
            this.audioEffectsFile = this.model.get('_audio')._feedback._soundEffect._correct;
          }
        },

        setupPartlyCorrectFeedback: function() {
          // Final
          if (this.model.get('_attemptsLeft') === 0 || !this.model.get('_audio')._feedback._partlyCorrect.notFinal) {
            if (this.model.get('_audio')._feedback._partlyCorrect.final) {
              this.audioFile = this.model.get('_audio')._feedback._partlyCorrect._final;
              // Effects audio
              if (this.audioEffectsEnabled) {
                this.audioEffectsFile = this.model.get('_audio')._feedback._soundEffect._partlyCorrect;
              }
            } else {
              this.setupIncorrectFeedback();
            }
          // Not final
          } else {
            this.audioFile = this.model.get('_audio')._feedback._partlyCorrect._notFinal;
            // Effects audio
            if (this.audioEffectsEnabled) {
              this.audioEffectsFile = this.model.get('_audio')._feedback._soundEffect._partlyCorrect;
            }
          }
        },

        setupIncorrectFeedback: function() {
          // apply individual item feedback
          if (this.model.has('_selectedItems') && (this.model.get('_selectable') === 1) && this.model.get('_selectedItems') !="" && this.model.get('_selectedItems')[0].feedback) {
            this.setupIndividualFeedbackAudio(this.model.get('_selectedItems')[0]._index);
          } else {
            // Final
            if (this.model.get('_attemptsLeft') === 0) {
              this.audioFile = this.model.get('_audio')._feedback._incorrect._final;
              // Not final
            } else {
              this.audioFile = this.model.get('_audio')._feedback._incorrect._notFinal;
            }
          }
          // Effects audio
          if (this.audioEffectsEnabled) {
            this.audioEffectsFile = this.model.get('_audio')._feedback._soundEffect._incorrect;
          }
        },

        setupIndividualFeedbackAudio: function(item) {
          var itemArray = new Array();
          itemArray = this.model.get('_audio')._feedback._items;
          this.audioFile = itemArray[item]._src;
        }

    });

    return AudioFeedbackView;

});
