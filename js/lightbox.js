/**
 * Image Lightbox Modal Handler
 * Provides modal lightbox functionality for image viewing with navigation support
 */

(function() {
    'use strict';

    // Get DOM elements
    const heroImage = document.getElementById('heroImage');
    const imageModal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalDiscipline = document.getElementById('modalDiscipline');
    const closeModal = document.getElementById('closeModal');
    const prevModal = document.getElementById('prevModal');
    const nextModal = document.getElementById('nextModal');

    // Screenshot thumbnails
    let screenshotThumbnails = [];
    let currentImageIndex = -1;

    // Initialize
    function init() {
        // Get all screenshot thumbnails
        screenshotThumbnails = Array.from(document.querySelectorAll('.screenshot-thumbnail'));
        
        // Check if required elements exist
        if (!imageModal || !modalImage) {
            console.warn('Lightbox: Required DOM elements not found');
            return;
        }

        // Add click listeners to thumbnails and hero image
        if (heroImage) {
            heroImage.addEventListener('click', function() {
                openModal(this, -1);
            });
        }

        screenshotThumbnails.forEach((thumb, index) => {
            thumb.addEventListener('click', function() {
                openModal(this, index);
            });
        });

        // Attach close button event listener with event capture to ensure it fires
        if (closeModal) {
            closeModal.addEventListener('click', function(event) {
                event.stopPropagation();
                closeImageModal();
            }, true);
        }

        if (prevModal) {
            prevModal.addEventListener('click', function(event) {
                event.stopPropagation();
                showPrevImage();
            });
        }

        if (nextModal) {
            nextModal.addEventListener('click', function(event) {
                event.stopPropagation();
                showNextImage();
            });
        }

        imageModal.addEventListener('click', handleBackgroundClick);
        document.addEventListener('keydown', handleKeyPress);

        // Check for URL parameters to open images directly
        handleUrlParameters();
    }

    /**
     * Open the modal and display the clicked image
     * @param {Element} imageElement - The image element that was clicked
     * @param {number} index - The index in the screenshots array (-1 for hero image)
     */
    function openModal(imageElement, index) {
        imageModal.style.display = 'block';
        modalImage.src = imageElement.src;
        modalImage.alt = imageElement.alt;
        currentImageIndex = index;

        // Update navigation buttons visibility
        updateNavigationVisibility();

        // Update discipline caption for screenshots
        if (index >= 0 && screenshotThumbnails[index]) {
            const discipline = screenshotThumbnails[index].dataset.discipline;
            if (modalDiscipline) {
                modalDiscipline.textContent = discipline;
            }
        } else {
            if (modalDiscipline) {
                modalDiscipline.textContent = '';
            }
        }
    }

    /**
     * Close the modal
     */
    function closeImageModal() {
        imageModal.style.display = 'none';
        currentImageIndex = -1;
    }

    /**
     * Show the previous image
     */
    function showPrevImage() {
        if (currentImageIndex > 0) {
            currentImageIndex--;
            const prevImage = screenshotThumbnails[currentImageIndex];
            openModal(prevImage, currentImageIndex);
        }
    }

    /**
     * Show the next image
     */
    function showNextImage() {
        if (currentImageIndex < screenshotThumbnails.length - 1) {
            currentImageIndex++;
            const nextImage = screenshotThumbnails[currentImageIndex];
            openModal(nextImage, currentImageIndex);
        }
    }

    /**
     * Update navigation buttons visibility
     */
    function updateNavigationVisibility() {
        // Hide navigation if viewing hero image
        if (currentImageIndex < 0) {
            if (prevModal) prevModal.style.display = 'none';
            if (nextModal) nextModal.style.display = 'none';
            return;
        }

        // Show/hide prev button
        if (prevModal) {
            prevModal.style.display = currentImageIndex > 0 ? 'block' : 'none';
        }

        // Show/hide next button
        if (nextModal) {
            nextModal.style.display = currentImageIndex < screenshotThumbnails.length - 1 ? 'block' : 'none';
        }
    }

    /**
     * Handle modal background click (close if clicking outside image)
     */
    function handleBackgroundClick(event) {
        if (event.target === imageModal) {
            closeImageModal();
        }
    }

    /**
     * Handle URL parameters to open images directly
     * Supports ?image=discipline or ?image=index
     * Examples: ?image=electrical, ?image=sanitary, ?image=0, ?image=1
     */
    function handleUrlParameters() {
        const params = new URLSearchParams(window.location.search);
        const imageParam = params.get('image');

        if (!imageParam) {
            return;
        }

        // Try to find by discipline name (case-insensitive)
        const lowerParam = imageParam.toLowerCase();
        let targetIndex = -1;

        for (let i = 0; i < screenshotThumbnails.length; i++) {
            const discipline = screenshotThumbnails[i].dataset.discipline.toLowerCase();
            if (discipline === lowerParam) {
                targetIndex = i;
                break;
            }
        }

        // If not found by name, try by index
        if (targetIndex === -1) {
            const indexParam = parseInt(imageParam, 10);
            if (!isNaN(indexParam) && indexParam >= 0 && indexParam < screenshotThumbnails.length) {
                targetIndex = indexParam;
            }
        }

        // Open the image if found
        if (targetIndex >= 0) {
            setTimeout(() => {
                openModal(screenshotThumbnails[targetIndex], targetIndex);
            }, 100);
        }
    }

    /**
     * Handle keyboard navigation
     */
    function handleKeyPress(event) {
        if (imageModal.style.display !== 'block') {
            return;
        }

        switch (event.key) {
            case 'Escape':
                closeImageModal();
                break;
            case 'ArrowLeft':
                showPrevImage();
                break;
            case 'ArrowRight':
                showNextImage();
                break;
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
