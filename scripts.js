<script>
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
</script>
