import { useEffect } from 'react';

export default function PWAInputFix() {
  useEffect(() => {
    // Ultra-aggressive PWA input fix for iOS Safari
    const fixInputs = () => {
      const inputs = document.querySelectorAll('input, textarea, select');
      inputs.forEach((input: any) => {
        // Skip if already fixed
        if (input.dataset.pwaFixed === 'ultra') return;
        input.dataset.pwaFixed = 'ultra';
        
        // Remove any readonly attributes that block input
        input.removeAttribute('readonly');
        input.removeAttribute('disabled');
        
        // Ensure proper input attributes for iOS
        input.style.fontSize = '16px'; // Prevents zoom on iOS
        input.style.webkitUserSelect = 'text';
        input.style.userSelect = 'text';
        input.style.webkitTouchCallout = 'default';
        input.style.webkitAppearance = 'none';
        input.style.outline = 'none';
        
        // Set proper autocomplete attributes
        if (input.type === 'password') {
          input.setAttribute('autocomplete', input.id?.includes('new') || input.name?.includes('new') ? 'new-password' : 'current-password');
        } else if (input.type === 'email') {
          input.setAttribute('autocomplete', 'email');
        } else if (input.id === 'username' || input.name === 'username') {
          input.setAttribute('autocomplete', 'username');
        }
        
        // Disable iOS autocorrect/autocapitalize that can interfere
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('spellcheck', 'false');
        
        // Force input to be focusable
        input.tabIndex = 0;
        
        // Add ultra-aggressive event listeners with immediate focus
        const forceFocus = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Remove any blocking attributes
          input.removeAttribute('readonly');
          input.removeAttribute('disabled');
          
          // Multiple focus attempts
          const attemptFocus = () => {
            input.focus();
            input.click();
            
            // For password fields, set cursor to end
            if (input.type === 'password' && input.setSelectionRange) {
              setTimeout(() => {
                try { 
                  input.setSelectionRange(input.value.length, input.value.length);
                } catch {}
              }, 10);
            }
          };
          
          // Immediate attempt
          attemptFocus();
          
          // Delayed attempts
          setTimeout(attemptFocus, 0);
          setTimeout(attemptFocus, 50);
          setTimeout(attemptFocus, 100);
        };
        
        // Add listeners for all interaction types
        ['mousedown', 'touchstart', 'touchend', 'click', 'focus', 'tap', 'pointerdown'].forEach(eventType => {
          input.addEventListener(eventType, forceFocus, { passive: false, capture: true });
        });
        
        // Special touch handling for iOS
        input.addEventListener('touchstart', (e: TouchEvent) => {
          e.preventDefault();
          input.focus();
          
          // Trigger click after touch
          setTimeout(() => {
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            input.dispatchEvent(clickEvent);
          }, 0);
        }, { passive: false });
        
        // Focus handler with scroll fix
        input.addEventListener('focus', (e: Event) => {
          input.removeAttribute('readonly');
          
          setTimeout(() => {
            (e.target as HTMLElement).scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center',
              inline: 'nearest'
            });
          }, 300);
        });
        
        // Input event to maintain focus
        input.addEventListener('input', (e: Event) => {
          // Ensure input stays focused during typing
          if (document.activeElement !== input) {
            input.focus();
          }
        });
        
        // Blur handler to prevent losing focus accidentally
        input.addEventListener('blur', (e: Event) => {
          // If blur wasn't intentional (no other input focused), refocus
          setTimeout(() => {
            const activeElement = document.activeElement;
            if (!activeElement || (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA')) {
              // Only refocus if user was typing (has value)
              if (input.value && input.value.length > 0) {
                input.focus();
              }
            }
          }, 10);
        });
      });
    };
    
    // Run immediately
    fixInputs();
    
    // Run multiple times to catch dynamic content
    setTimeout(fixInputs, 100);
    setTimeout(fixInputs, 500);
    setTimeout(fixInputs, 1000);
    
    // Watch for new inputs with more aggressive detection
    const observer = new MutationObserver((mutations) => {
      let needsFix = false;
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Element node
              const element = node as Element;
              if (element.matches('input, textarea, select') || 
                  element.querySelector('input, textarea, select')) {
                needsFix = true;
              }
            }
          });
        }
      });
      
      if (needsFix) {
        setTimeout(fixInputs, 50);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });
    
    // Global touch handler to prevent iOS quirks
    document.addEventListener('touchstart', (e) => {
      const target = e.target as HTMLElement;
      if (target.matches('input, textarea, select')) {
        e.stopPropagation();
      }
    }, { passive: false, capture: true });
    
    return () => {
      observer.disconnect();
    };
  }, []);
  
  return null;
}