define([
    'core/js/adapt',
    './audio-prompt-view',
    './audio-navigation-view',
    './audio-drawer-view',
    './audio-menu-view',
    './audio-controls-view',
    './audio-results-view',
    '../libraries/gsap.min'
], function(Adapt, AudioPromptView, AudioNavigationView, AudioDrawerView, AudioMenuView, AudioControlsView, AudioResultsView, GSAP) {

    var AudioController = _.extend({

        initialize: function() {


            this.listenToOnce(Adapt, 'app:dataReady', this.onDataReady);
        },

        onDataReady: function() {
            this.listenTo(Adapt.config, 'change:_activeLanguage', this.onLangChange);

            if (Adapt.course.get('_audio') && Adapt.course.get('_audio')._isEnabled) {
                this.setupAudio();
                this.setupEventListeners();
                this.addAudioDrawerItem();
            }
        },

        setupEventListeners: function() {
            this.listenToOnce(Adapt, 'router:location', this.checkLaunch);

            this.listenTo(Adapt, {
                'navigationView:postRender': this.renderNavigationView,
                'menuView:postRender': this.onMenuReady,
                'articleView:postRender blockView:postRender componentView:postRender': this.onABCReady,
                'audio:onscreenOff': this.onscreenOff,
                'audio:playAudio': this.playAudio,
                'audio:pauseAudio': this.pauseAudio,
                'audio:audioEnded': this.audioEnded,
                'audio:updateAudioStatus': this.updateAudioStatus,
                'audio:showAudioDrawer': this.setupDrawerAudio,
                'audio:changeText': this.changeText,
                'notify:closed': this.notifyClosed,
                'audio:popupOpened': this.popupOpened,
                'audio:popupClosed': this.popupClosed,
                'audio:stopNarrationChannel': this.stopNarrationChannel,
                'audio:stopEffectsChannel': this.stopEffectsChannel,
                'audio:stopMusicChannel': this.stopMusicChannel,
                'audio:stopAllChannels menuView:preRender pageView:preRender': this.stopAllChannels
            });
        },

        setupAudio: function() {
            if (Adapt.course.get('_audio') && Adapt.course.get('_audio')._reducedTextisEnabled) {
                this.reducedTextEnabled = Adapt.course.get('_audio')._reducedTextisEnabled;
            } else {
                this.reducedTextEnabled = false;
            }

            // Define audio model for all other views and components to reference
            Adapt.audio = {};
            Adapt.audio.audioClip = [];

            Adapt.audio.isConfigured = false;

            // Set variables to be used for the initial prompt
            Adapt.audio.promptView = null;
            Adapt.audio.promptIsOpen = false;
            Adapt.audio.externalPromptIsOpen = false;

            // Set default text size to full
            Adapt.audio.textSize = 0;

            Adapt.audio.playAriaLabel = Adapt.course.get('_globals')._extensions._audio ? Adapt.course.get('_globals')._extensions._audio.playAriaLabel : "";
            Adapt.audio.pauseAriaLabel = Adapt.course.get('_globals')._extensions._audio ? Adapt.course.get('_globals')._extensions._audio.pauseAriaLabel : "";
            Adapt.audio.stopAriaLabel = Adapt.course.get('_globals')._extensions._audio ? Adapt.course.get('_globals')._extensions._audio.stopAriaLabel : "";

            // Set action for the pause button
            Adapt.audio.pauseStopAction = Adapt.course.get('_audio')._pauseStopAction;

            // Set trigger position for onscreen percentFromTop detection
            Adapt.audio.triggerPosition = Adapt.course.get('_audio')._triggerPosition;

            // Set global variables based on course JSON
            Adapt.audio.autoPlayGlobal = Adapt.course.get('_audio')._autoplay ? true : false;
            Adapt.audio.autoPlayOnceGlobal = Adapt.course.get('_audio')._autoPlayOnce ? true : false;

            // Get names for icons from course.config
            Adapt.audio.iconOn = Adapt.course.get('_audio')._icons._audioOn;
            Adapt.audio.iconOff = Adapt.course.get('_audio')._icons._audioOff;
            Adapt.audio.iconPlay = Adapt.course.get('_audio')._icons._audioPlay;
            Adapt.audio.iconPause = Adapt.course.get('_audio')._icons._audioPause;

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
            Adapt.audio.audioClip[0].status = Adapt.course.get('_audio')._channels._narration._status;
            Adapt.audio.audioClip[1].status = Adapt.course.get('_audio')._channels._effects._status;
            Adapt.audio.audioClip[2].status = Adapt.course.get('_audio')._channels._music._status;
            Adapt.audio.audioStatus = Adapt.audio.audioClip[0].status;
            Adapt.audio.playTimeline = this.playTimeline.bind(this.playTimeline);
            Adapt.audio.pausedTimeline = this.pausedTimeline.bind(this.pausedTimeline);


            // Collect data from offline storage
            if (Adapt.offlineStorage.get('audio_level') == '1' || Adapt.offlineStorage.get('audio_level') == '0') {
                // Set to saved audio status and text size
                Adapt.audio.audioStatus = Adapt.offlineStorage.get('audio_level');
                Adapt.audio.textSize = Adapt.offlineStorage.get('audio_textSize');
            }
            // Update channels based on preference
            for (var i = 0; i < Adapt.audio.numChannels; i++) {
                Adapt.audio.audioClip[i].status = parseInt(Adapt.audio.audioStatus);
            }
            // Change text and audio based on preference
            this.updateAudioStatus(0, Adapt.audio.audioStatus);
            this.changeText(Adapt.audio.textSize);
        },

        renderNavigationView: function() {
            var audioModel = Adapt.course.get('_audio');

            if (!audioModel._showOnNavbar) return;

            var audioNavigationModel = new Backbone.Model(audioModel);
            $('.nav__drawer-btn').after(new AudioNavigationView({
                model: audioNavigationModel,
                attributes: {
                    'aria-label': Adapt.course.get('_globals')._extensions._audio.navigationAriaLabel
                }
            }).$el);
        },

        checkLaunch: function() {
            // Check launch based on the saved location
            if ((Adapt.offlineStorage.get('location') === 'undefined') || (Adapt.offlineStorage.get('location') === undefined) || (Adapt.offlineStorage.get('location') == "")) {
                if (Adapt.course.get('_audio')._prompt._isEnabled) {
                    this.listenToOnce(Adapt, 'pageView:ready menuView:ready', this.onReady);
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
                this.audioConfigured();
            }
        },

        onReady: function() {
            _.defer(function() {
                this.stopListening(Adapt, 'pageView:ready menuView:ready', this.onReady);
                this.showAudioPrompt();
            }.bind(this));
        },

        bookmarkOpened: function() {
            Adapt.audio.promptIsOpen = true;
            this.listenToOnce(Adapt, 'bookmarking:cancel', this.onPromptClosed);
        },

        onLangChange: function() {
            this.stopListening(Adapt, {
                'navigationView:postRender': this.renderNavigationView,
                'menuView:postRender': this.onMenuReady,
                'articleView:postRender blockView:postRender componentView:postRender': this.onABCReady,
                'audio:onscreenOff': this.onscreenOff,
                'audio:playAudio': this.playAudio,
                'audio:pauseAudio': this.pauseAudio,
                'audio:audioEnded': this.audioEnded,
                'audio:updateAudioStatus': this.updateAudioStatus,
                'audio:showAudioDrawer': this.setupDrawerAudio,
                'audio:changeText': this.changeText,
                'notify:closed': this.notifyClosed,
                'audio:popupOpened': this.popupOpened,
                'audio:popupClosed': this.popupClosed,
                'audio:stopNarrationChannel': this.stopNarrationChannel,
                'audio:stopEffectsChannel': this.stopEffectsChannel,
                'audio:stopMusicChannel': this.stopMusicChannel,
                'audio:stopAllChannels menuView:preRender pageView:preRender': this.stopAllChannels,
                'bookmarking:cancel': this.promptClosed
            });

            this.stopListening(Adapt.config, 'change:_activeLanguage', this.onLangChange);

            // Set empty location so that the prompt is checked
            Adapt.offlineStorage.set('location', "");

            this.listenToOnce(Adapt, 'app:dataReady', this.onDataReady);
        },

        showAudioPrompt: function() {
            if (Adapt.audio.promptIsOpen) return;

            Adapt.audio.promptIsOpen = true;

            var audioPromptModel = Adapt.course.get('_audio')._prompt;

            // Set model data depending on audio and text settings
            var promptTitle = "";
            var promptBody = "";
            var promptInstruction = "";
            var promptButton1Text = "";
            var promptButton2Text = "";
            var promptButton1Callback = "";
            var promptButton2Callback = "";

            // If audio is off
            if (Adapt.audio.audioStatus == 0) {
                if (this.reducedTextEnabled) {
                    promptTitle = audioPromptModel.title;
                    promptBody = audioPromptModel.bodyAudioOff;
                    promptInstruction = audioPromptModel.instructionAudioOff;

                    promptButton1Text = audioPromptModel._buttons.full;
                    promptButton2Text = audioPromptModel._buttons.reduced;

                    promptButton1Callback = 'fullTextAudioOff';
                    promptButton2Callback = 'reducedTextAudioOff';

                } else {
                    promptTitle = audioPromptModel.titleNoReduced;
                    promptBody = audioPromptModel.bodyNoReducedAudioOff;
                    promptInstruction = audioPromptModel.instructionNoReducedAudioOff;

                    promptButton1Text = audioPromptModel._buttons.continue;
                    promptButton2Text = audioPromptModel._buttons.turnOn;

                    promptButton1Callback = 'selectContinueAudioOff';
                    promptButton2Callback = 'selectOn';
                }
            } else {
                if (this.reducedTextEnabled) {
                    promptTitle = audioPromptModel.title;
                    promptBody = audioPromptModel.bodyAudioOn;
                    promptInstruction = audioPromptModel.instructionAudioOn;

                    promptButton1Text = audioPromptModel._buttons.full;
                    promptButton2Text = audioPromptModel._buttons.reduced;

                    promptButton1Callback = 'fullTextAudioOn';
                    promptButton2Callback = 'reducedTextAudioOn';

                } else {
                    promptTitle = audioPromptModel.titleNoReduced;
                    promptBody = audioPromptModel.bodyNoReducedAudioOn;
                    promptInstruction = audioPromptModel.instructionNoReducedAudioOn;

                    promptButton1Text = audioPromptModel._buttons.continue;
                    promptButton2Text = audioPromptModel._buttons.turnOff;

                    promptButton1Callback = 'selectContinueAudioOn';
                    promptButton2Callback = 'selectOff';
                }
            }

            var audioPrompt = new Backbone.Model(audioPromptModel);

            audioPrompt.set('promptTitle', promptTitle);
            audioPrompt.set('promptBody', promptBody);
            audioPrompt.set('promptInstruction', promptInstruction);
            audioPrompt.set('promptButton1Text', promptButton1Text);
            audioPrompt.set('promptButton2Text', promptButton2Text);
            audioPrompt.set('promptButton1Callback', promptButton1Callback);
            audioPrompt.set('promptButton2Callback', promptButton2Callback);

            Adapt.audio.promptView = new AudioPromptView({
                model: audioPrompt
            });

            Adapt.notify.popup({
                _view: Adapt.audio.promptView,
                _isCancellable: true,
                _showCloseButton: false,
                _closeOnBackdrop: true,
                _classes: ' audio-prompt'
            });

            this.listenToOnce(Adapt, {
                'popup:closed': this.onPromptClosed
            });
        },

        onPromptClosed: function() {
            if (Adapt.audio.externalPromptIsOpen == true) {
                Adapt.audio.promptIsOpen = true;
            } else {
                Adapt.audio.promptIsOpen = false;
            }

            this.audioConfigured();
        },

        changeText: function(value) {
            Adapt.audio.textSize = value;
            this.updateOfflineStorage();
        },

        onscreenOff: function(id, channel) {
            if (id == Adapt.audio.audioClip[channel].playingID) {
                Adapt.audio.audioClip[channel].onscreenID = "";
                this.pauseAudio(channel);
                this.pausedTimeline(Adapt.audio.audioClip[channel].playingID)
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
                if (Adapt.audio.promptIsOpen == false || popup == true) {
                    try {
                        var delay = 500;
                        if (id === null) {
                            delay = 0;
                        }

                        setTimeout(function() {
                            AudioController.createTimeline(id, Adapt.audio.audioClip[channel].duration)

                            AudioController.playTimeline(id);
                            Adapt.audio.audioClip[channel].play();



                            // Adapt.audio.audioClip[channel].ontimeupdate = function() { AudioController.updateTimeline(id, Adapt.audio.audioClip[channel].currentTime) };

                            Adapt.audio.audioClip[channel].isPlaying = true;
                        }, delay);

                        if (id != null) {
                            this.showAudioIcon(channel);
                        }

                    } catch (e) {
                        console.log('Audio play error:' + e);
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
                for (var key in this.tl) {
                    //this.tl[key].paused(true).progress(1)
                    this.tl[key].paused(true).progress(1)
                }
            }
        },

        audioEnded: function(channel) {
            Adapt.audio.audioClip[channel].isPlaying = false;
            this.hideAudioIcon(channel);
        },

        notifyClosed: function() {
            this.stopNarrationChannel();
            this.stopEffectsChannel();
            Adapt.audio.promptIsOpen = false;
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

        stopAllChannels: function() {
            // Pause all channels
            for (var i = 0; i < Adapt.audio.numChannels; i++) {
                this.pauseAudio(i);
            }
        },

        stopNarrationChannel: function() {
            this.pauseAudio(0);
        },

        stopEffectsChannel: function() {
            this.pauseAudio(1);
        },

        stopMusicChannel: function() {
            this.pauseAudio(2);
        },

        showAudioIcon: function(channel) {
            var audioHTMLId = '#' + Adapt.audio.audioClip[channel].newID;

            $(audioHTMLId).find('.audio__controls-icon').removeClass(Adapt.audio.iconPlay);
            $(audioHTMLId).find('.audio__controls-icon').addClass(Adapt.audio.iconPause);
            $(audioHTMLId).addClass('playing');

            if (Adapt.audio.pauseStopAction == 'pause') {
                $(audioHTMLId).attr('aria-label', $.a11y_normalize(Adapt.audio.pauseAriaLabel));
            } else {
                $(audioHTMLId).attr('aria-label', $.a11y_normalize(Adapt.audio.stopAriaLabel));
            }
        },

        hideAudioIcon: function(channel) {
            if (!Adapt.audio.audioClip[channel].playingID) return;

            var audioHTMLId = '#' + Adapt.audio.audioClip[channel].playingID;

            $(audioHTMLId).find('.audio__controls-icon').removeClass(Adapt.audio.iconPause);
            $(audioHTMLId).find('.audio__controls-icon').addClass(Adapt.audio.iconPlay);
            $(audioHTMLId).removeClass('playing');

            $(audioHTMLId).attr('aria-label', $.a11y_normalize(Adapt.audio.playAriaLabel));
        },

        updateAudioStatus: function(channel, value) {
            Adapt.audio.audioClip[channel].status = value;
            // Pause audio channel
            Adapt.trigger('audio:pauseAudio', channel);
            // Set to off
            Adapt.audio.audioStatus = 0;
            // Check for narration channel being on
            if (Adapt.audio.audioClip[0].status == 1) {
                Adapt.audio.audioStatus = 1;
            }
            this.updateOfflineStorage();
        },

        updateOfflineStorage: function() {
            Adapt.offlineStorage.set('audio_level', Adapt.audio.audioStatus);
            Adapt.offlineStorage.set('audio_textSize', Adapt.audio.textSize);
        },

        audioConfigured: function() {
            for (var i = 0; i < Adapt.audio.numChannels; i++) {
                Adapt.audio.audioClip[i].play();
                Adapt.audio.audioClip[i].isPlaying = false;
                Adapt.audio.audioClip[i].pause();
            }

            Adapt.audio.isConfigured = true;
            Adapt.trigger('audio:configured');
        },

        addAudioDrawerItem: function() {
            var drawerAudio = Adapt.course.get('_audio');
            var drawerObject = {
                title: drawerAudio.title,
                description: drawerAudio.description,
                className: 'audio-drawer',
                drawerOrder: drawerAudio._drawerOrder || 0
            };
            Adapt.drawer.addItem(drawerObject, 'audio:showAudioDrawer');
        },

        setupDrawerAudio: function() {
            var audioDrawerModel = Adapt.course.get('_audio');
            var audioDrawerModel = new Backbone.Model(audioDrawerModel);

            Adapt.drawer.triggerCustomView(new AudioDrawerView({
                model: audioDrawerModel
            }).$el);
        },

        onMenuReady: function(view) {
            if (view.model && view.model.get('_audio') && view.model.get('_type') == 'menu' && view.model.get('_audio')._isEnabled) {
                // Pause all channels on view load
                this.stopAllChannels();
                // Only render current location menu
                if (Adapt.location._currentId == view.model.get('_id')) {
                    new AudioMenuView({ model: view.model });
                }
            }
        },

        createTimeline: function(id, duration) {
            window.tl = window.tl || {};

            if (window.tl[id] === undefined) {
                window.tl[id] = new TimelineMax({ paused: true });
                //  this.tl[id].duration(duration);
                $('.' + id).each(function() {
                    if ($(this).find('.anim').length) {
                        $(this).find('.anim').each(function() {
                            let dur = Number($(this).attr('data-dur')) || 0;
                            let tx = Number($(this).attr('data-tx')) || 0;
                            let ty = Number($(this).attr('data-ty')) || 0;
                            let fx = Number($(this).attr('data-fx')) || 0;
                            let fy = Number($(this).attr('data-fy')) || 0;
                            let s = Number($(this).attr('data-s')) || 0;
                            window.tl[id].fromTo($(this), dur, { opacity: 0, x: fx, y: fy }, { opacity: 1, x: tx, y: ty }, s);
                        });
                    };
                });
            } else {
                window.tl[id].restart()
            }
        },
        playTimeline: function(id) {
            window.tl[id].play()
        },
        pausedTimeline: function(id) {
             if(window.tl) {
                if(window.tl[id]) window.tl[id].paused(true).progress(1) ; 
             }
        },
        restartTimeline: function(id) {
            window.tl[id].restart(id)
        },
        updateTimeline: function(id, time) {
            // this.tl[id].seek(time); 
            //console.log("id", id, "time", time)
        },

        onABCReady: function(view) {
            if (view.model && view.model.get('_audio') && view.model.get('_audio')._isEnabled) {
                // Pause all channels on view load
                this.stopAllChannels();
                // Only render view if it DOESN'T already exist - Work around for hotgraphic component
                if (!$('.' + view.model.get('_id')).find('.audio-controls').length) {
                    new AudioControlsView({ model: view.model, playTimeline: this.playTimeline, pausedTimeline: this.pausedTimeline });
                }
            }
            if (view.model && view.model.get('_audioAssessment') && view.model.get('_audioAssessment')._isEnabled) {
                // Pause all channels on view load
                this.stopAllChannels();
                // Only render view if it DOESN'T already exist - Work around for assessmentResults component
                if (!$('.' + view.model.get('_id')).find('.audio-controls').length) {
                    new AudioResultsView({ model: view.model });
                }
            }
        }

    }, Backbone.Events);

    AudioController.initialize();

    return AudioController;

});