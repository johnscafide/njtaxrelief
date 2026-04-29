  (function() {
    // Initialize EmailJS with your Public Key
    emailjs.init("u262kw5AoJcBI342V"); 
  })();

  function submitLead() {
    const btn = document.querySelector('.submit-btn');
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
        alert("Submission failed. Please try again.");
        btn.innerText = "Request Free Consultation →";
      });
  }

  // Placeholder for the ANCHOR Calculator logic
  let currentStep = 1;
  function nextStep(step) {
    document.getElementById(`step${step}`).classList.remove('active');
    currentStep++;
    document.getElementById(`step${currentStep}`).classList.add('active');
    document.getElementById('progress').style.width = (currentStep * 16) + "%";
  }
  
  function selectChoice(key, value, btn) {
    // Basic logic to highlight selected button and enable "Next"
    const parent = btn.parentElement;
    parent.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('active-choice'));
    btn.classList.add('active-choice');
    document.getElementById(`next${currentStep}`).disabled = false;
  }

function calcStayNJ() {
  const tax = parseFloat(document.getElementById('staynj-tax').value) || 0;
  const income = parseFloat(document.getElementById('staynj-income').value) || 0;
  const resultDiv = document.getElementById('staynj-result');
  
  if (tax > 0 && income <= 500000) {
    // Stay NJ is 50% of taxes, capped at $6,500
    let credit = Math.min((tax * 0.5), 6500);
    document.getElementById('staynj-amount').innerText = `$${credit.toLocaleString()}`;
    resultDiv.style.display = 'block';
  } else if (income > 500000) {
    document.getElementById('staynj-amount').innerText = "Ineligible";
    document.getElementById('staynj-label').innerText = "Income exceeds $500k limit";
    resultDiv.style.display = 'block';
  }
}
