(function() {
    // Initialize EmailJS with your Public Key
    emailjs.init("u262kw5AoJcBI342V"); 
})();

function submitLead() {
    const btn = document.querySelector('.submit-btn');
    // Note: The keys below (name, email, etc.) must match your EmailJS Template variables
    const data = {
        name: document.getElementById('cf-name').value,
        email: document.getElementById('cf-email').value,
        phone: document.getElementById('cf-phone').value,
        topic: document.getElementById('cf-topic').value,
        town: document.getElementById('cf-town').value
    };

    if(!data.name || !data.email) {
        alert("Please fill in your name and email.");
        return;
    }

    btn.innerText = "Sending...";

    emailjs.send("service_gptqbyx", "template_q1kaure", data)
        .then(() => {
            document.getElementById('contact-form').style.display = 'none';
            document.getElementById('form-success').style.display = 'block';
        }, (error) => {
            console.error("EmailJS Error:", error);
            alert("Submission failed. Please try again.");
            btn.innerText = "Request Free Consultation →";
        });
}

function toggleMobileMenu() {
    const navLinks = document.getElementById('navLinks');
    navLinks.classList.toggle('active');
}

// Automatically close menu when a link is clicked
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
        document.getElementById('navLinks').classList.remove('active');
    });
});

// --- News Strip Auto-Rotation ---
document.addEventListener("DOMContentLoaded", function() {
    const newsItems = document.querySelectorAll('.news-item');
    let currentIndex = 0;

    if (newsItems.length > 1) {
        // Initially hide all but the first item
        newsItems.forEach((item, index) => {
            if (index !== 0) item.style.display = 'none';
        });

        setInterval(() => {
            // Fade out current item
            newsItems[currentIndex].style.opacity = '0';
            
            setTimeout(() => {
                newsItems[currentIndex].style.display = 'none';
                
                // Move to next item
                currentIndex = (currentIndex + 1) % newsItems.length;
                
                // Show and fade in next item
                newsItems[currentIndex].style.display = 'flex';
                newsItems[currentIndex].style.opacity = '0';
                
                // Trigger reflow for transition
                newsItems[currentIndex].offsetHeight; 
                newsItems[currentIndex].style.transition = 'opacity 0.5s ease';
                newsItems[currentIndex].style.opacity = '1';
            }, 500); // Half-second for the fade-out
        }, 4000); // Rotate every 4 seconds
    }
});

// --- PAS-1 Walkthrough Accordion Logic ---
function togglePAS(element) {
    // Find the parent item
    const item = element.parentElement;
    
    // Check if it's already active
    const isActive = item.classList.contains('active');
    
    // Close all other open items (optional, but cleaner)
    document.querySelectorAll('.pas-acc-item').forEach(acc => {
        acc.classList.remove('active');
    });
    
    // If it wasn't active, open it
    if (!isActive) {
        item.classList.add('active');
    }
}

// Persistent Lead Magnet Logic
document.addEventListener("DOMContentLoaded", function() {
    // Check if they've already seen it this session
    if (!sessionStorage.getItem('rebateModalSeen')) {
        setTimeout(() => {
            showRebateModal();
            sessionStorage.setItem('rebateModalSeen', 'true');
        }, 3000); // Shows after 3 seconds
    } else {
        // If they already saw it/minimized it, show the sticky link
        document.getElementById('sticky-rebate-link').style.display = 'inline-flex';
    }
});

function showRebateModal() {
    document.getElementById('rebate-modal').style.display = 'flex';
    document.getElementById('sticky-rebate-link').style.display = 'none';
}

function minimizeRebateModal() {
    document.getElementById('rebate-modal').style.display = 'none';
    document.getElementById('sticky-rebate-link').style.display = 'inline-flex';
}

function downloadChecklist() {
    const email = document.getElementById('modal-email').value;
    if (email) {
        // Trigger EmailJS to notify you of a new lead
        emailjs.send("service_gptqbyx", "template_q1kaure", {
            email: email,
            topic: "Checklist Download"
        });
        
        // Open the PDF
        window.open('NJ_Tax_Relief_Checklist.pdf', '_blank');
        minimizeRebateModal();
    } else {
        alert("Please enter your email to receive the checklist.");
    }
}


// --- FAQ Accordion Logic ---
function toggleFAQ(element) {
    const faqItem = element.parentElement;
    const isActive = faqItem.classList.contains('active');
    
    // Close all other FAQs
    document.querySelectorAll('.faq-item').forEach(faq => {
        faq.classList.remove('active');
    });
    
    // Toggle current
    if (!isActive) {
        faqItem.classList.add('active');
    }
}


// --- ANCHOR Calculator Logic ---
let currentStep = 1;

function nextStep(step) {
    document.getElementById(`step${step}`).classList.remove('active');
    currentStep = step + 1;
    const nextEl = document.getElementById(`step${currentStep}`);
    if (nextEl) {
        nextEl.classList.add('active');
        document.getElementById('progress').style.width = (currentStep * 16) + "%";
    }
}

function prevStep(step) {
    document.getElementById(`step${step}`).classList.remove('active');
    currentStep = step - 1;
    document.getElementById(`step${currentStep}`).classList.add('active');
    document.getElementById('progress').style.width = (currentStep * 16) + "%";
}

function selectChoice(key, value, btn) {
    const parent = btn.parentElement;
    parent.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('active-choice'));
    btn.classList.add('active-choice');
    
    // Enables the specific "Next" button for the current step
    const nextBtn = document.getElementById(`next${currentStep}`);
    if (nextBtn) nextBtn.disabled = false;
}

// --- Stay NJ Calculator Logic ---
function calcStayNJ() {
    const tax = parseFloat(document.getElementById('staynj-tax').value) || 0;
    const income = parseFloat(document.getElementById('staynj-income').value) || 0;
    const resultDiv = document.getElementById('staynj-result');
    const amountSpan = document.getElementById('staynj-amount');
    const labelSpan = document.getElementById('staynj-label');
    
    if (tax > 0 && income <= 500000) {
        let credit = Math.min((tax * 0.5), 6500);
        amountSpan.innerText = `$${credit.toLocaleString()}`;
        labelSpan.innerText = "Estimated Stay NJ Annual Credit";
        resultDiv.style.display = 'block';
    } else if (income > 500000) {
        amountSpan.innerText = "Ineligible";
        labelSpan.innerText = "Income exceeds $500k limit";
        resultDiv.style.display = 'block';
    } else {
        resultDiv.style.display = 'none';
    }
}
