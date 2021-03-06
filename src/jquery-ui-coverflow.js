/*
 * Copyright (c) 2012 Planet Telex Inc. all rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
typeof jQuery != 'undefined' &&
typeof jQuery.ui != 'undefined' &&
(function ($) {
    var position = {
        left: 1,
        center: 2,
        right: 3
    };

    $.widget('pt.coverflow', {
        /* Begin Widget Overrides */

        widgetEventPrefix: 'pt.coverflow',

        options: {
            width: null,                // Display width of the coverflow. Defaults to the container width.
            height: null,               // Display height of the coverflow. Defaults to the container height.
            selectedIndex: 0,           // The index of the cover to select where 0 is the first
            autoplay: {
                enabled: false,
                interval: 3,            // Seconds between changing covers
                pauseOnMouseenter: true,
                playsPerCategory: 3     // Includes the first cover loaded in the category
            },
            categories: {
                enabled: false,
                defaultCategory: "Unknown", // Name of category applied to covers that don't have one specified.
                selectedCategory: null,     // Name of the category to select.
                renderTitles: true,
                rememberLastCover: true,    // Show the last cover displayed when returning to the category. This is always true when autoplay is enabled.
                delAnimationCount: 4,       // Number of old covers animated on remove during category change
                addAnimationRadius: 4       // Number of new covers animated on each side of the selected cover during category change
            },
            cover: {
                height: 300,            // Display height of each cover.
                width: 300,             // Display width of each cover.
                animation: {
                    perspective: {
                        duration: 80,   // Milliseconds
                        inner: 120      // Percentage of duration
                    },
                    radius: 20          // Number of covers animated on each side of the selected cover
                },
                background: {
                    style: null,        // Color or url applied to the backround in CSS (defaults to the container color)
                    size: 90,           // Percentage of original image
                    overlap: {
                        inner: 20,      // Percentage of overlap
                        outer: 80       // Percentage of overlap
                    }
                },
                perspective: {
                    angle: 12,          // Angle in degrees from the outside corner to the center. The same value is applied to the top and bottom.
                    enabled: true
                },
                reflection: {
                    enabled: true,
                    initialOpacity: 30, // Percentage 0(transparent) <=> 100(opaque)
                    length: 80          // Percentage of original image
                },
                title: {
                    enabled: true
                }
            },
            images: [],                 // The collection of image objects to be displayed in the coverflow. Image structure = { src: "", title: "", subtitle: "", category: "" }
            slider: {
                enabled: true,
                width: 80               // Percentage of the width of the coverflow container
            }
        },

        _create: function () {
            ///<summary>Creates a new instance of the Coverflow.</summary>
            ///<returns type="Undefined" />

            this._categories = [];
            this._categoryData = {};
            this.options.width = this.options.width || this.element.width();
            this.options.height = this.options.height || this.element.height();
            if (!$().slider) {
                this.options.slider = false;
            }

            this._currentIndex = this.options.selectedIndex;

            if (this.options.images.length > 0) {
                var i = null, image, alt;
                for (i in this.options.images) {
                    image = this.options.images[i];

                    alt = "";
                    if (image.title) {
                        alt = image.title;
                    }
                    if (image.subtitle) {
                        if (alt !== "") {
                            alt += ", ";
                        }
                        alt += image.subtitle;
                    }

                    this.element.append(
                       $("<img/>")
                           .attr({
                               src: image.src,
                               alt: alt
                           })
                            .data({
                                title: image.title,
                                subtitle: image.subtitle,
                                category: image.category
                            })
                    );
                }
            }

            // CSS that is required for Coverflow to function correctly.
            this.element.css({
                position: "relative",
                overflow: "hidden"
            });
            this._$images = this.element.find("img");
            this._loadImages();
            this._loadSlider();

            if (this.options.categories.enabled) {
                this._setCurrentCategory(this.options.categories.selectedCategory);
                this._loadCategoryTitles();
            }

            if (this.options.autoplay.enabled) {
                this._play();
            }
        },

        _setOption: function (key, value) {
            ///<summary>Sets an option.</summary>
            ///<param name="key" type="String">The option name (key in the options object).</param>
            ///<param name="value" type="Object">The is a mixed type value of the option.</param>
            ///<returns type="Undefined" />

            switch (key) {
                case "selectedIndex":
                    this._gotoCover(value);
                    break;

                case "categories":
                    if (value.selectedCategory != this.options.categories.selectedCategory) {
                        this._gotoCategory(value.selectedCategory);
                    }
                    break;

                case "autoplay":
                    if (value.enabled) {
                        this._play();
                    }
                    else {
                        this._pause();
                    }
                    break;
            }

            $.Widget.prototype._setOption.apply(this, arguments);
        },

        destroy: function () {
            ///<summary>Destroys the Coverflow instance and restores the DOM to its original state prior to the Coverflow creation.</summary>
            ///<returns type="Undefined" />

            this._pause();

            this._$images.each(function (i, img) {
                $(img).cover("destroy");
            });
            if (this._$categories) {
                this._$categories.remove();
            }
            if (this._$slider) {
                this._$slider.slider("destroy").remove();
            }

            this.element.unbind().css({
                position: "",
                overflow: ""
            });

            $.Widget.prototype.destroy.call(this);
        },

        /* End Widget Overrides */

        _$activeImages: [],
        _categories: [],
        _$categories: null,
        _$images: [],
        _categoryData: {},
        _isPauseManual: false,
        _$slider: null,
        _$sliderHandleHelper: null,
        _currentIndex: 0,
        _currentCategoryIndex: 0,
        _playIntervalId: null,
        _playCountInCategory: 0,

        addImage: function ($image, isAnimated) {
            /// <summary>
            /// Adds a new image to the end of the Coverflow on the right.
            /// If categories are active then the image may not immediately
            /// be displayed if its category doesn't match the currently active one.
            /// </summary>
            /// <param name="$image" type="jQuery">The image to be added.</param>
            /// <param name="isAnimated" type="Boolean">Determines if the image should be animated as its added.</param>
            ///<returns type="Undefined" />

            isAnimated = typeof isAnimated == "undefined" ? true : isAnimated;
            this._addImage($image, false, isAnimated);
            this._trigger("imageAdded", null, { selectedIndex: this._currentIndex });
        },

        _addImage: function ($image, isChangingCategory, isAnimated) {
            /// <summary>
            /// Adds a new image to the end of the Coverflow on the right.
            /// </summary>
            /// <param name="$image" type="jQuery">The image to be added.</param>
            /// <param name="isChangingCategory" type="Boolean">
            /// Determines if the category is being changed or not.
            /// This way during a category change images are allowed to be added to the previously active category.
            /// Defaults to false.
            /// </param>
            /// <param name="isAnimated" type="Boolean">Determines if the image should be animated as its added.</param>
            ///<returns type="Undefined" />

            isChangingCategory = isChangingCategory || false;
            if (!$image.data("pt-cover")) {
                this._$activeImages.each(function (i, img) {
                    $(img).cover("raiseZ");
                });

                $image.remove();
                this.element.append($image);
                var category = this._loadImage($image[0]);
                // Only display the image as active when it matches the current category if enabled.
                if (isChangingCategory || (!this.options.categories.enabled || this._getCurrentCategory() == category)) {
                    this._$activeImages.push($image[0]);
                    this._createCover(this._imagesCount() - 1, $image[0], position.right);
                    this._updateCover(isAnimated, true, this._currentIndex, this._imagesCount() - 1, $image[0], position.center);
                    this._syncSlider();
                }
            }
        },

        removeImage: function (isAnimated) {
            ///<summary>
            /// Removes the first image on the left of the Coverflow.
            ///</summary>
            ///<returns type="Undefined" />

            isAnimated = typeof isAnimated == "undefined" ? true : isAnimated;
            if (this._imagesCount() > 1) {
                this._removeImage(false, isAnimated);
                this._trigger("imageRemoved", null, { selectedIndex: this._currentIndex });
            }
        },

        _removeImage: function (isChangingCategory, isAnimated) {
            /// <summary>
            /// Removes one image from the front of the Coverflow on the left.
            /// </summary>
            /// <param name="isChangingCategory" type="Boolean">
            /// Determines if the category is being changed or not.
            /// This way during a category change images are allowed to be added to the previously active category.
            /// Defaults to false.
            /// </param>
            /// <param name="isAnimated" type="Boolean">Determines if the image should be animated as its added.</param>
            ///<returns type="Undefined" />

            var removeIndex = 0,
                image = this._$activeImages.splice(removeIndex, 1);

            this.element.one("pt.coverrefreshed-" + $(image).data("pt-coverflow").id, function (e, data) {
                $(data.image).cover("destroy");
            });

            this._updateCover(isAnimated, true, this._currentIndex, removeIndex, image, position.left);

            this._$activeImages.each(function (index, img) {
                $(img).cover("lowerZ");
                $(img).data("pt-coverflow").index = index;
            });

            var selectedIndex;
            if (removeIndex == this._currentIndex) {
                selectedIndex = this._currentIndex;
            }
            else {
                selectedIndex = this._currentIndex - 1;
            }

            if (!isChangingCategory) {
                this._gotoCover(selectedIndex, true);
            }
            else {
                this._currentIndex = selectedIndex;
            }

            this._syncSlider();

            return image;
        },

        isPlaying: function () {
            ///<summary>
            /// Determines if the Coverflow is currently playing.
            ///</summary>
            ///<returns type="Boolean"><c>true</c> if play mode is active.</returns>

            return (this._playIntervalId !== null);
        },

        play: function () {
            ///<summary>
            /// Turns on autoplay mode.
            ///</summary>
            ///<returns type="Undefined" />

            this._isPauseManual = false;
            var autoplay = $.extend(true, {}, this.options.autoplay);
            autoplay.enabled = true;
            this._setOption("autoplay", autoplay);
            this._trigger("play", null, { selectedIndex: this._currentIndex });
        },

        _play: function () {
            ///<summary>
            /// Turns on autoplay mode, but does not trigger any events.
            ///</summary>
            ///<returns type="Undefined" />

            if (!this.isPlaying()) {
                this._playIntervalId = setInterval(this._playNext.bind(this), this.options.autoplay.interval * 1000);
            }
        },

        _playNext: function () {
            ///<summary>
            /// Controls what gets played next during each interval while autoplay mode is enabled.
            /// If categories are enabled then the next one might be shown instead of the next cover.
            ///</summary>
            ///<returns type="Undefined" />

            if (this.options.categories.enabled) {
                if (this._playCountInCategory > this._imagesCount() || this._playCountInCategory >= this.options.autoplay.playsPerCategory - 1) {
                    this.nextCategory();
                    this._playCountInCategory = 0;

                    return;
                }
                else {
                    ++this._playCountInCategory;
                }
            }

            this._nextCover();
        },

        pause: function () {
            this._isPauseManual = true;
            this._pause();
            this._trigger("pause", null, { selectedIndex: this._currentIndex });
        },

        _pause: function () {
            if (this.isPlaying()) {
                clearInterval(this._playIntervalId);
                this._playIntervalId = null;
            }
        },

        togglePlay: function () {
            if (this.isPlaying()) {
                this._isPauseManual = true;
                this._pause();
            }
            else {
                this._isPauseManual = false;
                var autoplay = $.extend(true, {}, this.options.autoplay);
                autoplay.enabled = true;
                this._setOption("autoplay", autoplay);
            }
            this._trigger("togglePlay", null, { selectedIndex: this._currentIndex });
        },

        _setCurrentCategory: function (selectedCategory) {
            ///<summary>
            /// Finds the currentCategoryIndex based off the selectedCategory and sets it.
            ///</summary>
            ///<param name="selectedCategory" type="String" />
            ///<returns type="Undefined" />

            if (selectedCategory) {
                for (var i = 0; i < this._categories.length; i++) {
                    if (this._categories[i] == selectedCategory) {
                        this._currentCategoryIndex = i;
                        break;
                    }
                }
            }
        },

        _getCurrentCategory: function () {
            return this._categories[this._currentCategoryIndex];
        },

        nextCategory: function () {
            if (this.options.categories.enabled) {
                this._nextCategory();
                this._trigger("nextCategory", null, { selectedCategory: this._getCurrentCategory() });
            }
        },

        _nextCategory: function () {
            var selectedIndex;
            if (this._currentCategoryIndex == this._categories.length - 1) {
                selectedIndex = 0;
            }
            else {
                selectedIndex = this._currentCategoryIndex + 1;
            }

            if (selectedIndex != this._currentCategoryIndex) {
                this._gotoCategory(this._categories[selectedIndex]);
            }
        },

        prevCategory: function () {
            if (this.options.categories.enabled) {
                this._prevCategory();
                this._trigger("prevCategory", null, { selectedCategory: this._getCurrentCategory() });
            }
        },

        _prevCategory: function () {
            var selectedIndex;
            if (this._currentCategoryIndex === 0) {
                selectedIndex = this._categories.length - 1;
            }
            else {
                selectedIndex = this._currentCategoryIndex - 1;
            }

            this._gotoCategory(this._categories[selectedIndex]);
        },

        gotoCategory: function (selectedCategory) {
            if (this.options.categories.enabled) {
                var categories = $.extend(true, {}, this.options.categories);
                categories.selectedCategory = selectedCategory;
                this._setOption("categories", categories);
                this._trigger("gotoCategory", null, { selectedCategory: this._getCurrentCategory() });
            }
        },

        _gotoCategory: function (selectedCategory) {
            var images = this._categoryData[selectedCategory].images;
            if (images && images.length > 0) {
                var isChangingCategory = true,
                    isAnimated,
                    prevImagesCount = this._imagesCount(),
                    i;

                // Removes the old category's images
                for (i = 0; i < prevImagesCount; i++) {
                    this._removeImage(isChangingCategory, (i + 1 > this.options.categories.delAnimationCount ? false : true));
                }
                if ((this.options.autoplay.enabled && !this._isPauseManual) || this.options.categories.rememberLastCover) {
                    this._currentIndex = this._categoryData[selectedCategory].selectedIndex;
                }
                var start = Math.max(0, this._currentIndex - this.options.categories.addAnimationRadius),
                end = Math.min(images.length - 1, this._currentIndex + this.options.categories.addAnimationRadius);

                // Adds the new category's images
                for (i = 0; i < images.length; i++) {
                    isAnimated = start <= i && i <= end;
                    this._addImage($(images[i]), isChangingCategory, isAnimated);
                }

                this._setCurrentCategory(selectedCategory);
                this.options.categories.selectedCategory = selectedCategory;
                this._loadCategoryTitles();
            }
        },

        nextCover: function () {
            this._nextCover();
            this._trigger("nextCover", null, { selectedIndex: this._currentIndex });
        },

        _nextCover: function () {
            var selectedIndex;
            if (this._currentIndex == this._imagesCount() - 1) {
                selectedIndex = 0;
            }
            else {
                selectedIndex = this._currentIndex + 1;
            }

            this._gotoCover(selectedIndex);
        },

        prevCover: function () {
            this._prevCover();
            this._trigger("prevCover", null, { selectedIndex: this._currentIndex });
        },

        _prevCover: function () {
            var selectedIndex;
            if (this._currentIndex === 0) {
                selectedIndex = this._imagesCount() - 1;
            }
            else {
                selectedIndex = this._currentIndex - 1;
            }

            this._gotoCover(selectedIndex);
        },

        gotoCover: function (selectedIndex) {
            ///<summary>
            /// Wrapper for setting the "selectedIndex" option.
            ///</summary>
            ///<returns type="Undefined" />

            this._setOption("selectedIndex", selectedIndex);
            this._trigger("gotoCover", null, { selectedIndex: this._currentIndex });
        },

        _gotoCover: function (selectedIndex, isSliding) {
            isSliding = isSliding || false;
            if (this.options.slider.enabled && !isSliding) {
                this._$slider.slider("value", selectedIndex);
            }

            var index,
                isAnimated,
                start = Math.max(0, selectedIndex - this.options.cover.animation.radius),
                end = Math.min(this._$activeImages.length - 1, selectedIndex + this.options.cover.animation.radius);

            for (index = 0; index < this._$activeImages.length; index++) {
                isAnimated = start <= index && index <= end;
                this._updateCover(isAnimated, isSliding, selectedIndex, index, this._$activeImages[index]);
            }

            this._currentIndex = selectedIndex;

            if (this.options.categories.enabled) {
                var category = this._getCurrentCategory();
                this._categoryData[category].selectedIndex = selectedIndex;
            }

            if (this._currentIndex == this._imagesCount()) {
                this._trigger("lastCover", null, { selectedIndex: this._currentIndex });
            }
        },

        _createCover: function (index, image, initialPosition) {
            ///<summary>Creates the cover for an image and places it in the coverflow.</summary>
            ///<param name="index" type="Numeric" integer="true">The images index in the coverflow.</param>
            ///<param name="image" domElement="true">The image element from the DOM.</param>
            ///<param name="initialPosition" type="String">The initial placement of the cover relative to the coverflow container.</param>

            initialPosition = initialPosition || position.center;
            var isSliding = false,
                options = this._coverConfig(this._currentIndex, index, initialPosition, isSliding, {
                    id: (new Date()).getTime() * Math.random(),
                    click: this._clickCover.bind(this),
                    mouseenter: this._autoplayMouseEnter.bind(this),
                    mouseleave: this._autoplayMouseLeave.bind(this)
                });
            $(image).show().cover(options).data("pt-coverflow", {
                index: index,
                id: options.id
            });
        },

        _loadImages: function () {
            for (var i = 0; i < this._$images.length; i++) {
                this._loadImage(this._$images[i], true);
            }

            if (this.options.categories.enabled) {
                if (!this.options.categories.selectedCategory) {
                    this.options.categories.selectedCategory = this._categories[0];
                }
                this._categoryData[this.options.categories.selectedCategory].selectedIndex = this._currentIndex;
                this._$activeImages = $(this._categoryData[this.options.categories.selectedCategory].images);
            }
            else {
                this._$activeImages = this._$images;
            }

            this._$activeImages.each(this._createCover.bind(this));
        },

        _loadImage: function (image, loadCategories) {
            loadCategories = loadCategories || false;
            var $image = $(image).hide();

            var category = null;
            if (this.options.categories.enabled) {
                category = $image.data("category");
                if (!category) {
                    category = this.options.categories.defaultCategory;
                }

                if (loadCategories) {
                    if (!this._categoryData[category]) {
                        this._categoryData[category] = { selectedIndex: 0, images: [] };
                        this._categories.push(category);
                    }

                    this._categoryData[category].images.push(image);
                }
            }

            return category;
        },

        _updateCover: function (isAnimated, isSliding, selectedIndex, index, image, targetPosition) {
            /// <summary>Updates a cover's state based on the selectedIndex and index.</summary>
            /// <param name="isAnimated" type="Boolean">Determines if the image should be animated while its being updated.</param>
            /// <param name="isSliding" type="Boolean">True if the image is being updated while the slider is moving.</param>

            targetPosition = targetPosition || position.center;
            var coverOptions = this._coverConfig(selectedIndex, index, targetPosition, isSliding);
            //TODO Find another solution to using the positioning for settings these?
            //TODO For example, when going to previous category we might want to reverse this.
            if (targetPosition == position.left) {
                coverOptions.canvas.opacity = 0;
                coverOptions.animation.slide.easing = "swing";
            }
            else {
                coverOptions.canvas.opacity = 1;
            }
            var cover = $(image).data("pt-cover");
            for (var option in coverOptions) {
                cover.option(option, coverOptions[option]);
            }

            cover.refresh(isAnimated);
        },

        _sliderChange: function (event, ui) {
            if (ui.value != this._currentIndex) {
                this._gotoCover(ui.value, true);
                this._trigger("slide", null, { selectedIndex: this._currentIndex });
            }
        },

        _clickCover: function (e, data) {
            var imageIndex = data.image.data("pt-coverflow").index;
            var lastIndex = this._currentIndex;

            this._gotoCover(imageIndex);

            var eventName = "backgroundCoverClick";
            if (imageIndex == lastIndex) {
                eventName = "selectedCoverClick";
            }

            this._trigger(eventName, null, {
                lastIndex: lastIndex,
                selectedIndex: this._currentIndex,
                image: data.image
            });
        },

        _autoplayMouseEnter: function () {
            if (this.options.autoplay.pauseOnMouseenter) {
                this._pause();
            }
            this._trigger("mouseenter", null, { selectedIndex: this._currentIndex });
        },

        _autoplayMouseLeave: function () {
            if (this.options.autoplay.pauseOnMouseenter) {
                if (this.options.autoplay.enabled && !this._isPauseManual) {
                    this._play();
                }
            }
            this._trigger("mouseleave", null, { selectedIndex: this._currentIndex });
        },

        _coverConfig: function (selectedIndex, index, initialPosition, isSliding, options) {
            initialPosition = initialPosition || position.center;
            options = options || {};
            var centerOffset = 0,
                perspective = "center",
                scale = 0;

            if (index < selectedIndex) {
                centerOffset = (selectedIndex - index) * -1;
                perspective = "left";
            }
            else if (index > selectedIndex) {
                centerOffset = index - selectedIndex;
                perspective = "right";
            }

            if (index != selectedIndex) {
                scale = 1 - (this.options.cover.background.size / 100);
            }

            var perspectiveDuration = this.options.cover.animation.perspective.duration;
            if (!isSliding && Math.abs(this._currentIndex - selectedIndex) == 1) {
                perspectiveDuration += perspectiveDuration * (this.options.cover.animation.perspective.inner / 100);
            }

            var coverWidth = this.options.cover.width - (scale * this.options.cover.width),
                coverHeight = this.options.cover.height - (scale * this.options.cover.height),
                coverOptions = $.extend(true, {}, this.options.cover, options, {
                    perspective: {
                        position: perspective
                    },
                    width: coverWidth,
                    height: coverHeight,
                    canvas: {
                        background: this.options.cover.background.style || this.element.css("background-color"),
                        left: this._coverLeft(centerOffset, coverWidth, initialPosition),
                        top: this._coverTop(centerOffset, coverHeight, scale),
                        zIndex: this._$activeImages.length - Math.abs(centerOffset)
                    },
                    animation: {
                        slide: {
                            duration: 900,
                            easing: "easeOutCirc"
                        },
                        perspective: {
                            duration: perspectiveDuration,
                            easing: "swing"
                        }
                    }
                });

            return coverOptions;
        },

        _coverLeft: function (centerOffset, coverWidth, initialPosition) {
            var left = 0;
            switch (initialPosition) {
                case position.center:
                    left = (this.options.width / 2) - (coverWidth / 2) + (coverWidth * centerOffset);
                    var overlap;
                    if (Math.abs(centerOffset) > 1) { // outer
                        overlap = (this.options.cover.background.overlap.outer / 100) * coverWidth;
                        overlap *= Math.abs(centerOffset) - 1;
                        overlap += (this.options.cover.background.overlap.inner / 100) * coverWidth;
                    }
                    else { // inner
                        overlap = (this.options.cover.background.overlap.inner / 100) * coverWidth;
                        overlap *= Math.abs(centerOffset);
                    }

                    if (centerOffset < 0) {
                        left += overlap;
                    }
                    else if (centerOffset > 0) {
                        left -= overlap;
                    }
                    break;

                case position.right:
                    left = this.options.width - coverWidth;
                    break;
            }

            return left;
        },

        _coverTop: function (centerOffset, coverHeight, scalePercentage) {
            var top = 0;
            if (centerOffset !== 0) {
                top += coverHeight * (scalePercentage / 2);
            }
            return top;
        },

        _imagesCount: function () {
            return this._$activeImages.length;
        },

        _loadCategoryTitles: function () {
            if (!this.options.categories.renderTitles) {
                return;
            }

            if (this._$categories) {
                this._$categories.remove();
            }

            this._$categories = $("<ul />").addClass("coverflow-categories");
            for (var i in this._categories) {
                var category = this._categories[i],
                    $cat = $("<li />")
                        .text(category)
                        .click($.curry(this, "gotoCategory", category));
                if (category == this._getCurrentCategory()) {
                    $cat.addClass("coverflow-selected-category");
                }
                this._$categories.append($cat);
            }
            this.element.before(this._$categories);
        },

        _loadSlider: function () {
            if (!this.options.slider.enabled) {
                return;
            }

            var coverCount = this._imagesCount(),
                sliderWidth = this.options.width - (1 - (this.options.slider.width / 100)) * this.options.width,
                handleSize = sliderWidth / coverCount;

            this._$slider = $("<div />")
                .bind("mouseenter", this._autoplayMouseEnter.bind(this))
                .bind("mouseleave", this._autoplayMouseLeave.bind(this))
                .css({
                    width: sliderWidth,
                    position: "absolute",
                    zIndex: coverCount + 1,
                    left: (this.options.width - sliderWidth) / 2
                })
                .addClass("coverflow-slider")
                .slider({
                    animate: true,
                    value: this._currentIndex,
                    max: coverCount - 1,
                    slide: this._sliderChange.bind(this)
                });

            
            this._$sliderHandleHelper = this._$slider.find(".ui-slider-handle")
                .css({
                    width: handleSize,
                    marginLeft: -handleSize / 2 - 2
                })
                .wrap($("<div class='ui-handle-helper-parent'></div>")
                    .width(sliderWidth - handleSize)
                    .css({
                        position: "relative",
                        height: "100%",
                        margin: "auto"
                    })
                )
                .parent();
                
            this.element.append(this._$slider);
        },

        _syncSlider: function () {
            if (!this.options.slider.enabled) {
                return;
            }

            var coverCount = this._imagesCount();
            
            if (coverCount < 2) {
                return;
            }
            
            this._$slider
                .css({ zIndex: coverCount + 1 })
                .slider("option", "max", coverCount - 1)
                .slider("value", this._currentIndex);

            var sliderWidth = this.options.width - (1 - (this.options.slider.width / 100)) * this.options.width,
                handleSize = sliderWidth / coverCount;

            this._$sliderHandleHelper
                .width(sliderWidth - handleSize)
                .find("a")
                    .css({
                        width: handleSize,
                        marginLeft: -handleSize / 2 - 2
                    });
        }
    });

    // TODO Implement currying with "bind" instead.
    $.curry = function (fn, proxy) {
        ///	<summary>
        ///		Just like proxy, but enhanced with the ability to "curry" arguments.
        ///     Takes a function and returns a new one that will always have a particular scope.
        ///	</summary>
        /// <remarks>
        ///     Not replacing the proxy method because there are still some edge cases where this breaks proxy.
        /// </remarks>
        /// <example>
        ///     Any of the following signatures will bind a function to a particular context and return the bound function.
        ///
        /// jQuery.curry( function, scope )
        /// jQuery.curry( scope, name )
        /// jQuery.curry( function, scope, args... )
        /// jQuery.curry( scope, name, args... )
        /// </example>
        ///	<param name="fn" type="Function">
        ///		The function whose scope will be changed.
        ///	</param>
        ///	<param name="proxy" type="Object">
        ///		The object to which the scope of the function should be set.
        ///	</param>
        ///	<returns type="Function" />

        var context = null, args = Array.prototype.slice.call(arguments, 2);

        if (arguments.length >= 2) {

            if (typeof proxy === "string") {
                context = fn;
                fn = context[proxy];
                proxy = undefined;

            }
            else if (proxy && !$.isFunction(proxy)) {
                context = proxy;
                proxy = undefined;

            }
        }

        if (!proxy && fn) {
            proxy = function () {
                var combinedArgs = $.merge([], args);
                combinedArgs = $.merge(combinedArgs, arguments);
                return fn.apply(context || this, combinedArgs);
            };
        }

        // Set the guid of unique handler to the same of original handler, so it can be removed
        if (fn) {
            proxy.guid = fn.guid = fn.guid || proxy.guid || $.guid++;
        }

        // So proxy can be declared as an argument
        return proxy;
    };
})(jQuery);
