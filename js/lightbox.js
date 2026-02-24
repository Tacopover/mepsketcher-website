/**
 * Image Lightbox Modal Handler
 * Provides modal lightbox functionality for image viewing
 */

(function() {
    'use strict';

    // Get DOM elements
    const heroImage = document.getElementById('heroImage');
    const imageModal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const closeModal = document.getElementById('closeModal');

    // Initialize lightbox only if all required elements exist
    if (!heroImage || !imageModal || !modalImage || !closeModal) {
        console.warn('Lightbox: Required DOM elements not found');
        return;
    }

    /**
     * Open the modal and display the clicked image
     */
    function openModal(imageElement) {
        imageModal.style.display = 'block';
        modalImage.src = imageElement.src;
        modalImage.alt = imageElement.alt;
    }

    /**
     * Close the modal
     */
    function closeImageModal() {
        imageModal.style.display = 'none';
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
     * Handle Escape key press (close modal)
     */
    function handleEscapeKey(event) {
        if (event.key === 'Escape' && imageModal.style.display === 'block') {
            closeImageModal();
        }
    }

    // Event listeners
    heroImage.addEventListener('click', function() {
        openModal(this);
    });

    closeModal.addEventListener('click', closeImageModal);

    imageModal.addEventListener('click', handleBackgroundClick);

    document.addEventListener('keydown', handleEscapeKey);

})();
