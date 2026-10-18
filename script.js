/* ==========================================
   CLEANFLOW ENGINEERING JAVASCRIPT
   School Project Demo
   Manual Payment Verification + Refund Requests
========================================== */

document.addEventListener("DOMContentLoaded", function () {

    /* ==========================================
       1. MOBILE NAVIGATION
    ========================================== */

    const menuToggle = document.getElementById("menuToggle");
    const navMenu = document.getElementById("navMenu");

    if (menuToggle && navMenu) {
        menuToggle.addEventListener("click", function () {
            navMenu.classList.toggle("active");

            const expanded = navMenu.classList.contains("active");
            menuToggle.setAttribute("aria-expanded", String(expanded));
        });

        navMenu.querySelectorAll("a").forEach(function (link) {
            link.addEventListener("click", function () {
                navMenu.classList.remove("active");
                menuToggle.setAttribute("aria-expanded", "false");
            });
        });
    }


    /* ==========================================
       2. SERVICE DETAILS MODAL
    ========================================== */

    const serviceModal = document.getElementById("serviceModal");
    const modalTitle = document.getElementById("modalTitle");
    const modalText = document.getElementById("modalText");

    const serviceDescriptions = {
        "Water Quality Testing":
            "Laboratory-based water quality testing to assess physical, chemical, and microbiological characteristics.",

        "Water Treatment Chemicals":
            "Treatment chemical recommendations based on laboratory findings.",

        "Laboratory Services":
            "Laboratory analysis, reporting, and interpretation of water quality results.",

        "Technical Consultation":
            "Guidance on water quality problems, treatment recommendations, and chemical selection.",

        "Water Quality Monitoring":
            "Follow-up testing to evaluate treatment effectiveness.",

        "On-Site Water Sampling":
            "Collection and preparation of water samples for laboratory analysis."
    };

    window.openService = function (service) {
        if (!serviceModal || !modalTitle || !modalText) return;

        modalTitle.textContent = service;
        modalText.textContent =
            serviceDescriptions[service] ||
            "CleanFlow Engineering provides water quality management services.";

        serviceModal.classList.add("show");
    };

    window.closeService = function () {
        if (serviceModal) {
            serviceModal.classList.remove("show");
        }
    };

    if (serviceModal) {
        serviceModal.addEventListener("click", function (event) {
            if (event.target === serviceModal) {
                window.closeService();
            }
        });
    }

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            window.closeService();
        }
    });


    /* ==========================================
       3. SELECT A SERVICE PACKAGE
    ========================================== */

    window.selectPackage = function (packageName) {
        const serviceSelect = document.getElementById("quoteService");
        const quoteSection = document.getElementById("quote");

        if (serviceSelect) {
            const options = Array.from(serviceSelect.options);

            let matchingOption = options.find(function (option) {
                return option.value === packageName;
            });

            // Support older package naming.
            if (!matchingOption && packageName === "Monitoring Plan") {
                matchingOption = options.find(function (option) {
                    return option.value === "Water Quality Monitoring";
                });
            }

            if (matchingOption) {
                serviceSelect.value = matchingOption.value;
            }
        }

        if (quoteSection) {
            quoteSection.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    };


    /* ==========================================
       4. HELPER FUNCTIONS
    ========================================== */

    
    // EmailJS setup for customer order confirmations
    const EMAILJS_PUBLIC_KEY = "zTVG7TfT8a3f7C28r";
    const EMAILJS_SERVICE_ID = "service_ndmbg2r";
    const EMAILJS_ORDER_TEMPLATE_ID = "template_sl7hzru";

    if (window.emailjs) {
        window.emailjs.init({
            publicKey: EMAILJS_PUBLIC_KEY
        });
    }

    function showMessage(element, message, success) {
        if (!element) return;

        element.textContent = message;
        element.setAttribute(
            "role",
            success ? "status" : "alert"
        );

        element.style.color = success ? "#167447" : "#b42318";
    }

    async function sendJSON(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  const text = await response.text();
  console.log("API URL:", url);
  console.log("HTTP status:", response.status);
  console.log("Server response:", text);

  let result;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      `Server returned non-JSON (HTTP ${response.status}). Open Console with F12.`
    );
  }

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result;
}

    function fileToDataURL(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();

            reader.onload = function () {
                resolve(reader.result);
            };

            reader.onerror = function () {
                reject(new Error("Could not read the uploaded receipt."));
            };

            reader.readAsDataURL(file);
        });
    }


    /* ==========================================
       5. CONSULTATION / CHECKOUT DETAILS FORM
       
       This form collects the customer's details.
       It does not send email through EmailJS.
    ========================================== */

    const quoteForm = document.getElementById("quoteForm");
    const quoteResult = document.getElementById("quoteResult");

    if (quoteForm) {
        quoteForm.addEventListener("submit", function (event) {
            event.preventDefault();

            if (!quoteForm.reportValidity()) return;

            const name =
                document.getElementById("quoteName")?.value.trim() || "";

            showMessage(
                quoteResult,
                "Checkout details saved for this session" +
                (name ? ", " + name : "") +
                ". Please select a payment method, follow the payment instructions, and upload your payment receipt below.",
                true
            );

            const paymentSection =
                document.getElementById("payment");

            const paymentArea =
                paymentSection ||
                document.getElementById("paymentSection") ||
                document.getElementById("checkout");

            if (paymentArea) {
                paymentArea.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        });
    }


    /* ==========================================
       6. PAYMENT METHOD SELECTION
    ========================================== */

    const paymentMethods = document.querySelectorAll(
        'input[name="paymentMethod"]'
    );

    const gcashPayment = document.getElementById("gcashPayment");
    const bankPayment = document.getElementById("bankPayment");
    const cardPayment = document.getElementById("cardPayment");

    function updatePaymentMethod() {
        const selected = document.querySelector(
            'input[name="paymentMethod"]:checked'
        );

        const value = selected ? selected.value : "";

        if (gcashPayment) {
            gcashPayment.hidden = value !== "GCash";
        }

        if (bankPayment) {
            bankPayment.hidden = value !== "Online Bank Transfer";
        }

        if (cardPayment) {
            cardPayment.hidden =
                !["Credit Card", "Debit Card"].includes(value);
        }

        const paymentResult = document.getElementById("paymentResult");

        if (
            paymentResult &&
            ["Credit Card", "Debit Card"].includes(value)
        ) {
            showMessage(
                paymentResult,
                "Credit and debit card transactions are not connected to a payment gateway in this demo. Please choose GCash or Online Bank Transfer for manual verification.",
                false
            );
        } else if (paymentResult) {
            paymentResult.textContent = "";
        }
    }

    paymentMethods.forEach(function (method) {
        method.addEventListener("change", updatePaymentMethod);
    });

    updatePaymentMethod();


    /* ==========================================
       7. SUBMIT DEMO ORDER
       
       Sends order information and receipt to server.js.
       This does NOT automatically verify actual payment.
    ========================================== */

    const submitOrderButton =
        document.getElementById("submitDemoOrderButton");

    if (submitOrderButton) {
        submitOrderButton.addEventListener("click", async function (event) {
            event.preventDefault();

            const paymentResult =
                document.getElementById("paymentResult");

            const nameInput = document.getElementById("quoteName");
            const emailInput = document.getElementById("quoteEmail");
            const companyInput = document.getElementById("quoteCompany");
            const serviceInput = document.getElementById("quoteService");
            const notesInput = document.getElementById("quoteMessage");

            const paymentReferenceInput =
                document.getElementById("paymentReference");

            const paymentProofInput =
                document.getElementById("paymentProof");

            const selectedMethod = document.querySelector(
                'input[name="paymentMethod"]:checked'
            );

            // Ensure required checkout details are complete.
            if (
                !nameInput ||
                !emailInput ||
                !serviceInput ||
                !nameInput.value.trim() ||
                !emailInput.value.trim() ||
                !serviceInput.value
            ) {
                showMessage(
                    paymentResult,
                    "Please complete your name, email address, and service package in the checkout details form first.",
                    false
                );

                document.getElementById("quote")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

                return;
            }

            if (!emailInput.checkValidity()) {
                showMessage(
                    paymentResult,
                    "Please enter a valid email address.",
                    false
                );
                emailInput.focus();
                return;
            }

            if (!selectedMethod) {
                showMessage(
                    paymentResult,
                    "Please select a payment method.",
                    false
                );
                return;
            }

            const paymentMethod = selectedMethod.value;

            // Cards cannot be processed without a payment gateway.
            if (
                paymentMethod === "Credit Card" ||
                paymentMethod === "Debit Card"
            ) {
                showMessage(
                    paymentResult,
                    "Card payments are not available in this demonstration. Please select GCash or Online Bank Transfer.",
                    false
                );
                return;
            }

            const receiptFile =
                paymentProofInput &&
                paymentProofInput.files &&
                paymentProofInput.files[0];

            if (!receiptFile) {
                showMessage(
                    paymentResult,
                    "Please upload your payment receipt or screenshot.",
                    false
                );
                paymentProofInput?.focus();
                return;
            }

            const allowedTypes = [
                "image/jpeg",
                "image/png",
                "image/webp",
                "application/pdf"
            ];

            if (!allowedTypes.includes(receiptFile.type)) {
                showMessage(
                    paymentResult,
                    "Unsupported file type. Upload a JPG, PNG, WEBP, or PDF receipt.",
                    false
                );
                return;
            }

            const maxFileSize = 4 * 1024 * 1024;

            if (receiptFile.size > maxFileSize) {
                showMessage(
                    paymentResult,
                    "Your receipt must be 4 MB or smaller.",
                    false
                );
                return;
            }

            const originalButtonText = submitOrderButton.textContent;
            submitOrderButton.disabled = true;
            submitOrderButton.textContent = "Submitting order...";

            showMessage(
                paymentResult,
                "Uploading your order and payment receipt...",
                true
            );

            try {
                const receiptDataURL = await fileToDataURL(receiptFile);

                const orderData = {
                    customerName: nameInput.value.trim(),
                    customerEmail: emailInput.value.trim(),
                    company: companyInput
                        ? companyInput.value.trim()
                        : "",
                    service: serviceInput.value,
                    paymentMethod: paymentMethod,
                    paymentReference: paymentReferenceInput
                        ? paymentReferenceInput.value.trim()
                        : "",
                    notes: notesInput
                        ? notesInput.value.trim()
                        : "",
                    receipt: {
                        name: receiptFile.name,
                        dataUrl: receiptDataURL
                    }
                };

                  const result = await sendJSON(
                    "/api/orders",
                    orderData
                  );

                  const orderId =
                    result.orderId ||
                    result.id ||
                    result.order?.id;


                  // Send the confirmation email only after the server
                  // successfully saves the order.
                  let emailMessage = "";

                  if (window.emailjs) {
                      try {
                          await window.emailjs.send(
                              EMAILJS_SERVICE_ID,
                              EMAILJS_ORDER_TEMPLATE_ID,
                              {
                                  email: emailInput.value.trim(),
                                  name: nameInput.value.trim(),
                                  order_id: orderId || "Not provided",
                                  company: companyInput
                                      ? companyInput.value.trim()
                                      : "",
                                  service: serviceInput.value,
                                  payment_method: paymentMethod,
                                  payment_reference: paymentReferenceInput
                                      ? paymentReferenceInput.value.trim()
                                      : "",
                                  status: "Pending Verification"
                              }
                          );

                          emailMessage =
                              "\nConfirmation email sent successfully.";
                      } catch (emailError) {
                          console.error(
                              "Order saved, but confirmation email failed:",
                              emailError
                          );

                          emailMessage =
                              "\nYour order was saved, but the confirmation email could not be sent. Please check the EmailJS settings.";
                      }
                  } else {
                      emailMessage =
                          "\nEmail service is unavailable. Your order was still saved.";
                  }

                  let successMessage =
                      "Your demo order has been submitted successfully.";

                  if (orderId) {
                    successMessage +=
                        "\nOrder reference: " + orderId;
                    const refundOrderId =
                        document.getElementById("refundOrderId");

                    if (refundOrderId) {
                        refundOrderId.value = orderId;
                    }
                }

                successMessage +=
                    "\nStatus: Awaiting manual payment verification. Your receipt must be checked by the administrator. This is not an automatic payment confirmation.";

                showMessage(
                    paymentResult,
                    successMessage + emailMessage,
                    true
                );

                const refundEmail =
                    document.getElementById("refundEmail");

                if (refundEmail) {
                    refundEmail.value = emailInput.value.trim();
                }

                // Clear only the receipt after successful submission.
                // Keep the customer and service details visible.
                if (paymentProofInput) {
                    paymentProofInput.value = "";
                }

            } catch (error) {
                console.error("Order submission error:", error);

                showMessage(
                    paymentResult,
                    error.message ||
                    "Unable to submit the order. Make sure the Node.js server is running and try again.",
                    false
                );
            } finally {
                submitOrderButton.disabled = false;
                submitOrderButton.textContent =
                    originalButtonText || "Submit Demo Order";
            }
        });
    }


    /* ==========================================
       8. REFUND REQUEST FORM
       
       Submits a refund request for admin review.
       This does NOT transfer money or automatically
       issue a refund.
    ========================================== */

    const refundForm = document.getElementById("refundForm");
    const refundResult = document.getElementById("refundResult");

    if (refundForm) {
        refundForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            if (!refundForm.reportValidity()) return;

            const orderId =
                document.getElementById("refundOrderId")?.value.trim() || "";

            const customerEmail =
                document.getElementById("refundEmail")?.value.trim() || "";

            const reason =
                document.getElementById("refundReason")?.value.trim() || "";

            if (!orderId || !customerEmail || !reason) {
                showMessage(
                    refundResult,
                    "Please enter your order reference, email address, and reason for the refund request.",
                    false
                );
                return;
            }

            const refundButton =
                refundForm.querySelector('button[type="submit"]');

            const originalButtonText =
                refundButton ? refundButton.textContent : "";

            if (refundButton) {
                refundButton.disabled = true;
                refundButton.textContent = "Submitting request...";
            }

            showMessage(
                refundResult,
                "Submitting your refund request...",
                true
            );

            try {
                const result = await sendJSON("/api/refunds", {
                    orderId: orderId,
                    customerEmail: customerEmail,
                    reason: reason
                });

                const refundReference =
                    result.refundId ||
                    result.id ||
                    result.refund?.id;

                let message =
                    "Your refund request has been submitted for administrator review.";

                if (refundReference) {
                    message +=
                        "\nRefund request reference: " + refundReference;
                }

                message +=
                    "\nNo money has been refunded automatically. The administrator must review the request and handle any actual refund separately.";

                showMessage(refundResult, message, true);

                // Keep the submitted information visible for reference.

            } catch (error) {
                console.error("Refund request error:", error);

                showMessage(
                    refundResult,
                    error.message ||
                    "Could not submit your refund request. Please check that the Node.js server is running.",
                    false
                );
            } finally {
                if (refundButton) {
                    refundButton.disabled = false;
                    refundButton.textContent =
                        originalButtonText || "Submit Refund Request";
                }
            }
        });
    }


    /* ==========================================
       9. OPTIONAL HEALTH CHECK
       
       Helps indicate whether the backend is reachable.
    ========================================== */

    fetch("/api/health")
        .then(function (response) {
            if (!response.ok) {
                throw new Error("Backend health check failed.");
            }

            return response.json();
        })
        .then(function (data) {
            console.log(
                "CleanFlow backend connected.",
                data
            );
        })
        .catch(function (error) {
            console.warn(
                "CleanFlow backend health check unavailable. Make sure server.js is running.",
                error
            );
        });

});
