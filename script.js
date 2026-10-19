
/* ==========================================
   CLEANFLOW ENGINEERING
   School Project Demo
   EmailJS + Node.js Backend
   Manual Payment Verification + Card Demo
   No real card processing or money transfers
========================================== */

document.addEventListener("DOMContentLoaded", function () {
    "use strict";

    /* 1. CONFIGURATION */

    const EMAILJS_PUBLIC_KEY = "zTVG7TfT8a3f7C28r";
    const EMAILJS_SERVICE_ID = "service_ndmbg2r";
    const EMAILJS_ADMIN_TEMPLATE_ID = "template_yzzz0ms";
    const EMAILJS_CUSTOMER_TEMPLATE_ID = "template_sl7hzru";
    const ADMIN_EMAIL = "cleanflowengineer@gmail.com";

    let emailJSReady = false;
    let orderSubmissionInProgress = false;
    let refundSubmissionInProgress = false;
    let simulatedCardResult = null;

    if (window.emailjs) {
        try {
            window.emailjs.init({
                publicKey: EMAILJS_PUBLIC_KEY
            });
            emailJSReady = true;
            console.log("EmailJS initialized.");
        } catch (error) {
            console.error("EmailJS initialization failed:", error);
        }
    } else {
        console.error("EmailJS SDK missing. Check index.html.");
    }

    /* 2. GENERAL HELPERS */

    function byId(id) {
        return document.getElementById(id);
    }

    function showMessage(element, message, success) {
        if (!element) return;

        element.textContent = message;
        element.style.whiteSpace = "pre-line";
        element.style.color = success ? "#167447" : "#b42318";
        element.setAttribute("role", success ? "status" : "alert");
    }

    function createRequestKey() {
        if (window.crypto &&
            typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }

        return "cf-" + Date.now() + "-" +
            Math.random().toString(36).slice(2);
    }

    async function sendJSON(url, data, idempotencyKey) {
        let response;

        try {
            const headers = {
                "Content-Type": "application/json"
            };

            if (idempotencyKey) {
                headers["Idempotency-Key"] = idempotencyKey;
            }

            response = await fetch(url, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(data)
            });
        } catch (error) {
            console.error("Backend connection failed:", error);

            throw new Error(
                "Cannot connect to the CleanFlow backend. " +
                "Check your Render deployment and API routes."
            );
        }

        const responseText = await response.text();
        let result;

        try {
            result = JSON.parse(responseText);
        } catch {
            throw new Error(
                "The server returned an unexpected response. " +
                "Check the backend API route."
            );
        }

        if (!response.ok) {
            throw new Error(
                result.error || result.message || "Request failed."
            );
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

    /* 3. EMAILJS */

    function makeEmailParameters(details, recipient, subject) {
        const name = details.customer_name || "";
        const email = details.customer_email || "";
        const notes = details.notes ||
            "No additional instructions provided.";

        return {
            to_email: recipient,
            email_subject: subject,
            name: name,
            email: email,
            customer_name: name,
            customer_email: email,
            company: details.company || "Not provided",
            order_id: details.order_id || "Not provided",
            service: details.service || "Not provided",
            payment_method: details.payment_method || "Not provided",
            payment_reference: details.payment_reference || "Not provided",
            note: notes,
            notes: notes,
            status: details.status || "Pending Verification",
            refund_id: details.refund_id || "Not applicable",
            reason: details.reason || "Not applicable"
        };
    }

    async function sendEmail(templateId, parameters) {
        if (!emailJSReady || !window.emailjs) {
            throw new Error("EmailJS is not initialized.");
        }

        return window.emailjs.send(
            EMAILJS_SERVICE_ID,
            templateId,
            parameters
        );
    }

    async function sendBothEmails(adminParameters, customerParameters) {
        const results = await Promise.allSettled([
            sendEmail(EMAILJS_ADMIN_TEMPLATE_ID, adminParameters),
            sendEmail(EMAILJS_CUSTOMER_TEMPLATE_ID, customerParameters)
        ]);

        const adminSent = results[0].status === "fulfilled";
        const customerSent = results[1].status === "fulfilled";

        if (!adminSent) {
            console.error("Admin email failed:", results[0].reason);
        }

        if (!customerSent) {
            console.error("Customer email failed:", results[1].reason);
        }

        return { adminSent, customerSent };
    }

    function emailStatusMessage(results, type) {
        if (results.adminSent && results.customerSent) {
            return "\nAdmin and customer " + type +
                " email requests were accepted by EmailJS.";
        }

        if (!results.adminSent && !results.customerSent) {
            return "\nThe " + type +
                " was saved, but both email attempts failed. Check EmailJS Email History.";
        }

        if (!results.adminSent) {
            return "\nThe customer email was accepted, but the admin email failed.";
        }

        return "\nThe admin email was accepted, but the customer email failed.";
    }

    /* 4. MOBILE NAVIGATION */

    const menuToggle = byId("menuToggle");
    const navMenu = byId("navMenu");

    if (menuToggle && navMenu) {
        menuToggle.addEventListener("click", function () {
            navMenu.classList.toggle("active");
            menuToggle.setAttribute(
                "aria-expanded",
                String(navMenu.classList.contains("active"))
            );
        });

        navMenu.querySelectorAll("a").forEach(function (link) {
            link.addEventListener("click", function () {
                navMenu.classList.remove("active");
                menuToggle.setAttribute("aria-expanded", "false");
            });
        });
    }

    /* 5. SERVICE DETAILS MODAL */

    const serviceModal = byId("serviceModal");
    const modalTitle = byId("modalTitle");
    const modalText = byId("modalText");

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
        modalText.textContent = serviceDescriptions[service] ||
            "CleanFlow Engineering provides water quality management services.";

        serviceModal.classList.add("show");
    };

    window.closeService = function () {
        if (serviceModal) serviceModal.classList.remove("show");
    };

    if (serviceModal) {
        serviceModal.addEventListener("click", function (event) {
            if (event.target === serviceModal) {
                window.closeService();
            }
        });
    }

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") window.closeService();
    });

    /* 6. SELECT A SERVICE PACKAGE */

    window.selectPackage = function (packageName) {
        const serviceSelect = byId("quoteService");
        const quoteSection = byId("quote");

        if (serviceSelect) {
            const option = Array.from(serviceSelect.options).find(
                function (item) {
                    return item.value === packageName;
                }
            );

            if (option) serviceSelect.value = option.value;
        }

        if (quoteSection) {
            quoteSection.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    };

    /* 7. CONTINUE TO PAYMENT */

    const continueButton = byId("continueToPaymentButton");

    if (continueButton) {
        continueButton.addEventListener("click", function (event) {
            event.preventDefault();

            const quoteForm = byId("quoteForm");

            if (quoteForm && !quoteForm.reportValidity()) return;

            const paymentSection =
                byId("payment") ||
                byId("paymentSection") ||
                byId("checkout");

            if (paymentSection) {
                paymentSection.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        });
    }

    /* 8. CHECKOUT DETAILS FORM */

    const quoteForm = byId("quoteForm");
    const quoteResult = byId("quoteResult");

    if (quoteForm) {
        quoteForm.addEventListener("submit", function (event) {
            event.preventDefault();

            if (!quoteForm.reportValidity()) return;

            showMessage(
                quoteResult,
                "Checkout details completed. Choose a payment method below.",
                true
            );

            const paymentSection = byId("payment");

            if (paymentSection) {
                paymentSection.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        });
    }

    /* 9. PAYMENT METHOD + CARD DEMO */

    const paymentMethods = document.querySelectorAll(
        'input[name="paymentMethod"]'
    );

    const gcashPayment = byId("gcashPayment");
    const bankPayment = byId("bankPayment");
    const cardPayment = byId("cardPayment");
    const paymentResult = byId("paymentResult");

    const demoCardType = byId("demoCardType");
    const demoCardResult = byId("demoCardResult");
    const runCardDemoButton = byId("runCardDemoButton");
    const cardDemoResult = byId("cardDemoResult");

    function resetCardDemo() {
        simulatedCardResult = null;

        if (demoCardResult) demoCardResult.value = "";
        if (cardDemoResult) cardDemoResult.textContent = "";
    }

    function updatePaymentMethod() {
        const selected = document.querySelector(
            'input[name="paymentMethod"]:checked'
        );

        const value = selected ? selected.value : "";
        const isCard = ["Credit Card", "Debit Card"].includes(value);

        if (gcashPayment) {
            gcashPayment.hidden = value !== "GCash";
        }

        if (bankPayment) {
            bankPayment.hidden = value !== "Online Bank Transfer";
        }

        if (cardPayment) {
            cardPayment.hidden = !isCard;
        }

        resetCardDemo();

        if (demoCardType && isCard) {
            demoCardType.value = value;
        }

        if (paymentResult) {
            paymentResult.textContent = "";
        }
    }

    paymentMethods.forEach(function (method) {
        method.addEventListener("change", updatePaymentMethod);
    });

    if (runCardDemoButton) {
        runCardDemoButton.addEventListener("click", function () {
            const selected = document.querySelector(
                'input[name="paymentMethod"]:checked'
            );

            if (!selected ||
                !["Credit Card", "Debit Card"].includes(selected.value)) {
                showMessage(
                    cardDemoResult,
                    "Select Credit Card or Debit Card first.",
                    false
                );
                return;
            }

            if (!demoCardType ||
                demoCardType.value !== selected.value) {
                showMessage(
                    cardDemoResult,
                    "Choose the same card type as your selected payment method.",
                    false
                );
                return;
            }

            if (!demoCardResult || !demoCardResult.value) {
                showMessage(
                    cardDemoResult,
                    "Choose a simulated result.",
                    false
                );
                return;
            }

            simulatedCardResult = demoCardResult.value;

            if (simulatedCardResult === "success") {
                showMessage(
                    cardDemoResult,
                    "DEMO SUCCESS: Simulated only. No money was charged and no real payment was verified.",
                    true
                );
            } else {
                showMessage(
                    cardDemoResult,
                    "DEMO DECLINED: Simulated only. No money was charged.",
                    false
                );
            }
        });
    }

    updatePaymentMethod();

    /* 10. SUBMIT DEMO ORDER */

    const submitOrderButton = byId("submitDemoOrderButton");

    if (submitOrderButton) {
        submitOrderButton.addEventListener("click", async function (event) {
            event.preventDefault();

            if (orderSubmissionInProgress) return;

            const nameInput = byId("quoteName");
            const emailInput = byId("quoteEmail");
            const companyInput = byId("quoteCompany");
            const serviceInput = byId("quoteService");
            const notesInput = byId("quoteMessage");
            const referenceInput = byId("paymentReference");
            const proofInput = byId("paymentProof");

            if (!nameInput || !emailInput || !serviceInput ||
                !nameInput.value.trim() ||
                !emailInput.value.trim() ||
                !serviceInput.value) {
                showMessage(
                    paymentResult,
                    "Complete your name, email, and service package first.",
                    false
                );

                byId("quote")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
                return;
            }

            if (!emailInput.checkValidity()) {
                showMessage(paymentResult, "Enter a valid email address.", false);
                emailInput.focus();
                return;
            }

            const selectedMethod = document.querySelector(
                'input[name="paymentMethod"]:checked'
            );

            if (!selectedMethod) {
                showMessage(paymentResult, "Select a payment method.", false);
                return;
            }

            const paymentMethod = selectedMethod.value;
            const isCardDemo =
                ["Credit Card", "Debit Card"].includes(paymentMethod);

            if (isCardDemo && simulatedCardResult !== "success") {
                showMessage(
                    paymentResult,
                    "Run the card demo and choose a successful simulated result before submitting.",
                    false
                );
                return;
            }

            if (isCardDemo && demoCardType &&
                demoCardType.value !== paymentMethod) {
                showMessage(
                    paymentResult,
                    "The demo card type does not match your selected payment method.",
                    false
                );
                return;
            }

            const receiptFile = proofInput?.files?.[0] || null;

            if (!isCardDemo && !receiptFile) {
                showMessage(
                    paymentResult,
                    "Upload your payment receipt or screenshot.",
                    false
                );
                proofInput?.focus();
                return;
            }

            if (receiptFile) {
                const allowedTypes = [
                    "image/jpeg",
                    "image/png",
                    "image/webp",
                    "application/pdf"
                ];

                if (!allowedTypes.includes(receiptFile.type)) {
                    showMessage(
                        paymentResult,
                        "Upload a JPG, PNG, WEBP, or PDF receipt.",
                        false
                    );
                    return;
                }

                if (receiptFile.size > 4 * 1024 * 1024) {
                    showMessage(
                        paymentResult,
                        "The receipt must be 4 MB or smaller.",
                        false
                    );
                    return;
                }
            }

            orderSubmissionInProgress = true;

            const originalButtonText = submitOrderButton.textContent;
            submitOrderButton.disabled = true;
            submitOrderButton.textContent = "Submitting order...";

            showMessage(paymentResult, "Saving your demo order...", true);

            try {
                const receiptDataURL = receiptFile
                    ? await fileToDataURL(receiptFile)
                    : null;

                const orderData = {
                    customerName: nameInput.value.trim(),
                    customerEmail: emailInput.value.trim(),
                    company: companyInput ? companyInput.value.trim() : "",
                    service: serviceInput.value,
                    paymentMethod: paymentMethod,
                    paymentReference: referenceInput
                        ? referenceInput.value.trim()
                        : "",
                    notes: notesInput ? notesInput.value.trim() : "",

                    // Explicitly label simulated card orders.
                    paymentMode: isCardDemo
                        ? "SIMULATED_DEMO"
                        : "MANUAL_VERIFICATION",

                    // This is user-provided demo data, not proof of payment.
                    demoPaymentResult: isCardDemo
                        ? simulatedCardResult
                        : null,

                    receipt: receiptFile
                        ? {
                            name: receiptFile.name,
                            dataUrl: receiptDataURL
                        }
                        : null
                };

                const result = await sendJSON(
                    "/api/orders",
                    orderData,
                    createRequestKey()
                );

                const orderId =
                    result.orderId ||
                    result.id ||
                    result.order?.id ||
                    "Not provided";

                const emailDetails = {
                    customer_name: nameInput.value.trim(),
                    customer_email: emailInput.value.trim(),
                    company: companyInput
                        ? companyInput.value.trim()
                        : "Not provided",
                    order_id: orderId,
                    service: serviceInput.value,
                    payment_method: paymentMethod +
                        (isCardDemo ? " (SIMULATED DEMO)" : ""),
                    payment_reference: referenceInput
                        ? referenceInput.value.trim()
                        : "Not provided",
                    notes: notesInput
                        ? notesInput.value.trim()
                        : "No additional instructions provided.",
                    status: "Pending Verification"
                };

                let emailMessage = "\nEmail notifications were not attempted.";

                if (emailJSReady) {
                    const emailResults = await sendBothEmails(
                        makeEmailParameters(
                            emailDetails,
                            ADMIN_EMAIL,
                            "NEW CLEANFLOW ORDER - " + orderId
                        ),
                        makeEmailParameters(
                            emailDetails,
                            emailInput.value.trim(),
                            "CleanFlow Order Confirmation - " + orderId
                        )
                    );

                    emailMessage = emailStatusMessage(emailResults, "order");
                } else {
                    emailMessage =
                        "\nThe order was saved, but EmailJS did not initialize.";
                }

                let message =
                    "Your demo order was submitted successfully.";

                if (orderId !== "Not provided") {
                    message += "\nOrder reference: " + orderId;

                    const refundOrderId = byId("refundOrderId");
                    if (refundOrderId) refundOrderId.value = orderId;
                }

                if (isCardDemo) {
                    message +=
                        "\nCard result: SIMULATED SUCCESS only." +
                        "\nNo money was charged. This is not a real payment confirmation.";
                } else {
                    message +=
                        "\nStatus: Pending Verification. An administrator must review the receipt.";
                }

                message += emailMessage;

                showMessage(paymentResult, message, true);

                const refundEmail = byId("refundEmail");
                if (refundEmail) {
                    refundEmail.value = emailInput.value.trim();
                }

                if (proofInput) proofInput.value = "";

            } catch (error) {
                console.error("Order submission error:", error);
                showMessage(
                    paymentResult,
                    error.message || "Could not submit your order.",
                    false
                );
            } finally {
                orderSubmissionInProgress = false;
                submitOrderButton.disabled = false;
                submitOrderButton.textContent =
                    originalButtonText || "Submit Demo Order";
            }
        });
    }

    /* 11. REFUND REQUEST FORM */

    const refundForm = byId("refundForm");
    const refundResult = byId("refundResult");

    if (refundForm) {
        refundForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            if (refundSubmissionInProgress) return;
            if (!refundForm.reportValidity()) return;

            const orderId = byId("refundOrderId")?.value.trim() || "";
            const customerEmail = byId("refundEmail")?.value.trim() || "";
            const reason = byId("refundReason")?.value.trim() || "";

            if (!orderId || !customerEmail || !reason) {
                showMessage(
                    refundResult,
                    "Enter the order ID, email address, and refund reason.",
                    false
                );
                return;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
                showMessage(refundResult, "Enter a valid email address.", false);
                return;
            }

            refundSubmissionInProgress = true;

            const refundButton =
                refundForm.querySelector('button[type="submit"]');

            const originalButtonText = refundButton
                ? refundButton.textContent
                : "";

            if (refundButton) {
                refundButton.disabled = true;
                refundButton.textContent = "Submitting request...";
            }

            showMessage(refundResult, "Submitting refund request...", true);

            try {
                const result = await sendJSON(
                    "/api/refunds",
                    {
                        orderId: orderId,
                        customerEmail: customerEmail,
                        reason: reason
                    },
                    createRequestKey()
                );

                const refundId =
                    result.refundId ||
                    result.id ||
                    result.refund?.id ||
                    "Not provided";

                let emailMessage =
                    "\nRefund email notifications were not attempted.";

                if (emailJSReady) {
                    const refundDetails = {
                        customer_name: "CleanFlow customer",
                        customer_email: customerEmail,
                        company: "Not provided",
                        order_id: orderId,
                        service: "Refund request",
                        payment_method: "Not applicable",
                        payment_reference: "Not applicable",
                        notes: "Refund request submitted for administrator review.",
                        status: result.status || "Refund Pending Review",
                        refund_id: refundId,
                        reason: reason
                    };

                    const emailResults = await sendBothEmails(
                        makeEmailParameters(
                            refundDetails,
                            ADMIN_EMAIL,
                            "NEW REFUND REQUEST - " + refundId
                        ),
                        makeEmailParameters(
                            refundDetails,
                            customerEmail,
                            "CleanFlow Refund Request Received - " + refundId
                        )
                    );

                    emailMessage = emailStatusMessage(
                        emailResults,
                        "refund request"
                    );
                } else {
                    emailMessage =
                        "\nThe refund was saved, but EmailJS is not initialized.";
                }

                let message =
                    "Your refund request was submitted for administrator review.";

                if (refundId !== "Not provided") {
                    message += "\nRefund reference: " + refundId;
                }

                message +=
                    "\nNo money has been refunded automatically. The administrator must review the request.";

                showMessage(refundResult, message + emailMessage, true);

            } catch (error) {
                console.error("Refund request error:", error);
                showMessage(
                    refundResult,
                    error.message || "Could not submit your refund request.",
                    false
                );
            } finally {
                refundSubmissionInProgress = false;

                if (refundButton) {
                    refundButton.disabled = false;
                    refundButton.textContent =
                        originalButtonText || "Submit Refund Request";
                }
            }
        });
    }

    /* 12. BACKEND HEALTH CHECK */

    fetch("/api/health", { cache: "no-store" })
        .then(async function (response) {
            const body = await response.text();

            console.log("CleanFlow health status:", response.status);
            console.log("CleanFlow health response:", body);

            if (!response.ok) {
                throw new Error("Health endpoint returned HTTP " + response.status);
            }
        })
        .catch(function (error) {
            console.warn("Backend health check failed. Verify your backend.", error);
        });
});
