// Simple script for the Open Props Demo

// Add smooth scrolling for anchor links
document.addEventListener("DOMContentLoaded", () => {
  // Get all buttons
  const buttons = document.querySelectorAll("button");

  // Add click animation to buttons
  buttons.forEach((button) => {
    button.addEventListener("click", (e) => {
      // Create ripple effect
      const ripple = document.createElement("span");
      ripple.classList.add("ripple");
      button.appendChild(ripple);

      // Position the ripple
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      // Apply styles
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;

      // Remove after animation completes
      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });

  // Add dark mode toggle functionality
  const createDarkModeToggle = () => {
    const footer = document.querySelector("footer .container");

    // Create toggle container
    const toggleContainer = document.createElement("div");
    toggleContainer.classList.add("dark-mode-toggle");
    toggleContainer.style.marginTop = "var(--size-fluid-2)";

    // Create toggle button
    const toggleButton = document.createElement("button");
    toggleButton.classList.add("tertiary", "small");
    toggleButton.textContent = "Toggle Dark Mode";
    toggleButton.addEventListener("click", () => {
      document.documentElement.classList.toggle("dark-theme");

      // Store preference
      const isDark = document.documentElement.classList.contains("dark-theme");
      localStorage.setItem("darkMode", isDark ? "dark" : "light");
    });

    // Add to DOM
    toggleContainer.appendChild(toggleButton);
    footer.appendChild(toggleContainer);

    // Check for saved preference
    const savedMode = localStorage.getItem("darkMode");
    if (savedMode === "dark") {
      document.documentElement.classList.add("dark-theme");
    }
  };

  createDarkModeToggle();

  // Add some animation to feature cards
  const featureCards = document.querySelectorAll(".feature-card");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("animate-in");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.2
    }
  );

  featureCards.forEach((card) => {
    // Set initial state
    card.style.opacity = "0";
    card.style.transform = "translateY(20px)";
    card.style.transition = "opacity 0.5s ease, transform 0.5s ease";

    // Add animation class
    card.classList.add("feature-animate");

    // Observe
    observer.observe(card);
  });

  // Animation callback
  document.addEventListener("animationend", (e) => {
    if (e.target.classList.contains("animate-in")) {
      e.target.style.opacity = "1";
      e.target.style.transform = "translateY(0)";
    }
  });
});

// Add CSS for ripple effect
const addRippleStyle = () => {
  const style = document.createElement("style");
  style.textContent = `
    .ripple {
      position: absolute;
      border-radius: 50%;
      background-color: rgba(255, 255, 255, 0.4);
      transform: scale(0);
      animation: ripple 0.6s linear;
      pointer-events: none;
    }
    
    @keyframes ripple {
      to {
        transform: scale(4);
        opacity: 0;
      }
    }
    
    button {
      position: relative;
      overflow: hidden;
    }
    
    .feature-animate.animate-in {
      animation: fadeIn 0.5s forwards;
    }
    
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
};

addRippleStyle();
