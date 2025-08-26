import { useState, useEffect, useRef } from 'react';

interface IOSInputProps {
  id: string;
  type: 'text' | 'password' | 'email';
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoComplete?: string;
}

export default function IOSInput({ 
  id, 
  type, 
  placeholder, 
  value, 
  onChange, 
  className = '',
  autoComplete 
}: IOSInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    // Ultra-aggressive iOS Safari fixes
    const setupInput = () => {
      // Force proper styling for iOS
      input.style.fontSize = '16px';
      input.style.webkitUserSelect = 'text';
      input.style.userSelect = 'text';
      input.style.webkitAppearance = 'none';
      input.style.outline = 'none';
      input.style.border = 'none';
      
      // Remove problematic attributes
      input.removeAttribute('readonly');
      input.removeAttribute('disabled');
      
      // Set proper attributes
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('spellcheck', 'false');
      
      if (autoComplete) {
        input.setAttribute('autocomplete', autoComplete);
      }
    };

    setupInput();

    // Handle all touch and click events
    const handleInteraction = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Remove readonly and focus immediately
      input.removeAttribute('readonly');
      input.focus();
      
      // Multiple focus attempts
      setTimeout(() => input.focus(), 0);
      setTimeout(() => input.focus(), 50);
      setTimeout(() => input.focus(), 100);
    };

    // Add event listeners
    ['touchstart', 'touchend', 'mousedown', 'click', 'focus'].forEach(event => {
      input.addEventListener(event, handleInteraction, { passive: false, capture: true });
    });

    // Handle input changes
    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement;
      setLocalValue(target.value);
      onChange(target.value);
    };

    input.addEventListener('input', handleInput);
    input.addEventListener('change', handleInput);

    return () => {
      ['touchstart', 'touchend', 'mousedown', 'click', 'focus'].forEach(event => {
        input.removeEventListener(event, handleInteraction);
      });
      input.removeEventListener('input', handleInput);
      input.removeEventListener('change', handleInput);
    };
  }, [onChange, autoComplete]);

  return (
    <input
      ref={inputRef}
      id={id}
      type={type}
      placeholder={placeholder}
      value={localValue}
      className={className}
      data-testid={`input-${id}`}
      // Prevent React from interfering
      onChange={() => {}} // Handled by native events
    />
  );
}