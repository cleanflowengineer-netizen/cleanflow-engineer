/* ==========================================
   CLEANFLOW ENGINEERING
   School Project Demo
   EmailJS + Node.js Backend
   GCash + Online Bank Transfer
   Simulated Credit/Debit Card Payments
   Manual Payment Verification + Refund Requests
========================================== */

document.addEventListener("DOMContentLoaded", function () {
    "use strict";

    /* ==========================================
       1. CONFIGURATION
    ========================================== */

    const EMAILJS_PUBLIC_KEY = "zTVG7TfT8a3f7C28r";
    const EMAILJS_SERVICE_ID = "service_ndmbg2r";

    // Admin receives NEW ORDER RECEIVED notifications.
    const EMAILJS_ADMIN_TEMPLATE_ID = "template_yzzz0ms";

    // Customer receives ORDER CONFIRMATION notifications.
    const EMAILJS_CUSTOMER_TEMPLATE_ID = "template_sl7hzru";

    const ADMIN_EMAIL = "cleanflowengineer@gmail.com";

    let emailJSReady = false;
    let orderSubmissionInProgress = false;
    let refundSubmissionInProgress = false;

    /* ==========================================
       INITIALIZE EMAILJS
    ========================================== */

    if (window.emailjs) {
        try {
            window.emailjs.init({
                publicKey: EMAILJS_PUBLIC_KEY
            });

            emailJSReady = true;

            console.log("EmailJS initialized successfully.");
        } catch (error) {
            console.error(
                "EmailJS initialization failed:",
                error
            );
        }
    } else {
        console.error(
            "EmailJS SDK missing. Check the script tags in index.html."
        );
    }

    /* ==========================================
       2. GENERAL HELPERS
    ========================================== */

    function byId(id) {
        return document.getElementById(id);
    }

    function showMessage(element, message, success) {
        if (!element) return;

        element.textContent = message;
        element.style.whiteSpace = "pre-line";

        element.style.color = success
            ? "#167447"
            : "#b42318";

        element.setAttribute(
            "role",
            success ? "status" : "alert"
        );
    }

    function createRequestKey() {
        if (
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
        ) {
            return window.crypto.randomUUID();
        }

        return (
            "cf-" +
            Date.now() +
            "-" +
            Math.random().toString(36).slice(2) +
            "-" +
            Math.random().toString(36).slice(2)
        );
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
            console.error(
                "Backend connection failed:",
                error
            );

            throw new Error(
                "Cannot connect to the CleanFlow backend. " +
                "Check that server.js is running and that the " +
                "website preview uses the same origin as the backend."
            );
        }

        const responseText = await response.text();

        console.log("API URL:", url);
        console.log("API status:", response.status);

        let result;

        try {
            result = JSON.parse(responseText);
        } catch {
            throw new Error(
                "The server returned an unexpected response. " +
                "Check the API route in server.js."
            );
        }

        if (!response.ok) {
            throw new Error(
                result.error ||
                result.message ||
                "Request failed."
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
                reject(
                    new Error(
                        "Could not read the uploaded receipt."
                    )
                );
            };

            reader.readAsDataURL(file);
        });
    }

    /* ==========================================
       3. EMAILJS HELPERS
    ========================================== */

    function makeEmailParameters(
        details,
        recipient,
        subject
    ) {
        const name = details.customer_name || "";
        const email = details.customer_email || "";

        const notes = details.notes ||
            "No additional instructions provided.";

        return {
            // Must match the recipient variable in EmailJS.
            to_email: recipient,

            email_subject: subject,

            name: name,
            email: email,

            customer_name: name,
            customer_email: email,

            company: details.company || "Not provided",

            order_id: details.order_id || "Not provided",

            service: details.service || "Not provided",

            payment_method:
                details.payment_method || "Not provided",

            payment_reference:
                details.payment_reference || "Not provided",

            note: notes,
            notes: notes,

            status:
                details.status || "Pending Verification",

            payment_status:
                details.payment_status ||
                details.status ||
                "Pending Verification",

            order_status:
                details.order_status ||
                details.status ||
                "Pending Verification",

            refund_id: details.refund_id || "Not applicable",

            refund_status:
                details.refund_status ||
                details.status ||
                "Pending Review",

            reason: details.reason || "Not applicable"
        };
    }

    async function sendEmail(templateId, parameters) {
        if (!emailJSReady || !window.emailjs) {
            throw new Error(
                "EmailJS is not initialized."
            );
        }

        return window.emailjs.send(
            EMAILJS_SERVICE_ID,
            templateId,
            parameters
        );
    }

    /*
     * Send the admin notification and customer confirmation
     * independently so a failure in one does not prevent
     * attempting the other.
     */

    async function sendBothEmails(
        adminParameters,
        customerParameters
    ) {
        const results = await Promise.allSettled([
            sendEmail(
                EMAILJS_ADMIN_TEMPLATE_ID,
                adminParameters
            ),

            sendEmail(
                EMAILJS_CUSTOMER_TEMPLATE_ID,
                customerParameters
            )
        ]);

        const adminSent =
            results[0].status === "fulfilled";

        const customerSent =
            results[1].status === "fulfilled";

        if (adminSent) {
            console.log(
                "Admin notification accepted by EmailJS."
            );
        } else {
            console.error(
                "Admin email failed:",
                results[0].reason
            );
        }

        if (customerSent) {
            console.log(
                "Customer email accepted by EmailJS."
            );
        } else {
            console.error(
                "Customer email failed:",
                results[1].reason
            );
        }

        return {
            adminSent: adminSent,
            customerSent: customerSent
        };
    }

    function emailStatusMessage(results, type) {
        if (results.adminSent && results.customerSent) {
            return (
                "\nAdmin and customer " +
                type +
                " emails were accepted by EmailJS."
            );
        }

        if (!results.adminSent && !results.customerSent) {
            return (
                "\nThe " +
                type +
                " was saved, but both email attempts failed. " +
                "Check the browser console and EmailJS Email History."
            );
        }

        if (!results.adminSent) {
            return (
                "\nThe customer email was accepted, but the admin " +
                "email failed. Check the admin template settings."
            );
        }

        return (
            "\nThe admin email was accepted, but the customer " +
            "email failed. Check the customer template settings."
        );
    }

    /*
     * This function is exposed for use by admin.html if needed.
     * It sends an order-status notification to the customer only.
     *
     * The admin dashboard must call this function only AFTER
     * the server confirms that the status update succeeded.
     */

    window.sendCleanFlowCustomerStatusEmail =
        async function (details) {
            if (!emailJSReady || !window.emailjs) {
                throw new Error(
                    "EmailJS is not initialized."
                );
            }

            if (
                !details ||
                !details.customer_email ||
                !details.order_status
            ) {
                throw new Error(
                    "Customer email and updated order status are required."
                );
            }

            const parameters = makeEmailParameters(
                details,
                details.customer_email,
                "CleanFlow Engineering - Order Status Update"
            );

            // Explicitly target the customer, never the admin.
            parameters.to_email = details.customer_email;

            parameters.order_status = details.order_status;

            parameters.status = details.order_status;

            parameters.payment_status =
                details.payment_status ||
                "Not applicable";

            return sendEmail(
                EMAILJS_CUSTOMER_TEMPLATE_ID,
                parameters
            );
        };

    /* ==========================================
       4. MOBILE NAVIGATION
    ========================================== */

    const menuToggle = byId("menuToggle");
    const navMenu = byId("navMenu");

    if (menuToggle && navMenu) {
        menuToggle.addEventListener("click", function () {
            navMenu.classList.toggle("active");

            menuToggle.setAttribute(
                "aria-expanded",
                String(
                    navMenu.classList.contains("active")
                )
            );
        });

        navMenu.querySelectorAll("a").forEach(
            function (link) {
                link.addEventListener("click", function () {
                    navMenu.classList.remove("active");

                    menuToggle.setAttribute(
                        "aria-expanded",
                        "false"
                    );
                });
            }
        );
    }

    /* ==========================================
       5. SERVICE DETAILS MODAL
    ========================================== */

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
        if (!serviceModal || !modalTitle || !modalText) {
            return;
        }

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
        serviceModal.addEventListener(
            "click",
            function (event) {
                if (event.target === serviceModal) {
                    window.closeService();
                }
            }
        );
    }

    document.addEventListener(
        "keydown",
        function (event) {
            if (event.key === "Escape") {
                window.closeService();
            }
        }
    );

    /* ==========================================
       6. SELECT A SERVICE PACKAGE
    ========================================== */

    window.selectPackage = function (packageName) {
        const serviceSelect = byId("quoteService");
        const quoteSection = byId("quote");

        if (serviceSelect) {
            let option = Array.from(
                serviceSelect.options
            ).find(function (item) {
                return item.value === packageName;
            });

            if (!option && packageName === "Monitoring Plan") {
                option = Array.from(
                    serviceSelect.options
                ).find(function (item) {
                    return (
                        item.value === "Water Quality Monitoring"
                    );
                });
            }

            if (option) {
                serviceSelect.value = option.value;
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
       7. CONTINUE TO PAYMENT
    ========================================== */

    const continueButton =
        byId("continueToPaymentButton");

    if (continueButton) {
        continueButton.addEventListener(
            "click",
            function (event) {
                event.preventDefault();

                const quoteForm = byId("quoteForm");

                if (
                    quoteForm &&
                    !quoteForm.reportValidity()
                ) {
                    return;
                }

                const paymentSection =
                    byId("payment") ||
                    byId("paymentSection") ||
                    byId("checkout");

                if (paymentSection) {
                    paymentSection.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                } else {
                    console.error(
                        "Payment section not found. Check index.html."
                    );
                }
            }
        );
    }

    /* ==========================================
       8. CHECKOUT DETAILS FORM
    ========================================== */

    const quoteForm = byId("quoteForm");
    const quoteResult = byId("quoteResult");

    if (quoteForm) {
        quoteForm.addEventListener(
            "submit",
            function (event) {
                event.preventDefault();

                if (!quoteForm.reportValidity()) {
                    return;
                }

                showMessage(
                    quoteResult,
                    "Checkout details completed. Continue to payment to select a payment method.",
                    true
                );

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
            }
        );
    }

    /* ==========================================
       9. PAYMENT METHOD SELECTION
    ========================================== */

    const paymentMethods = document.querySelectorAll(
        'input[name="paymentMethod"]'
    );

    const gcashPayment = byId("gcashPayment");
    const bankPayment = byId("bankPayment");
    const cardPayment = byId("cardPayment");
    const paymentResult = byId("paymentResult");

    function updatePaymentMethod() {
        const selected = document.querySelector(
            'input[name="paymentMethod"]:checked'
        );

        const value = selected ? selected.value : "";

        if (gcashPayment) {
            gcashPayment.hidden = value !== "GCash";
        }

        if (bankPayment) {
            bankPayment.hidden =
                value !== "Online Bank Transfer";
        }

        if (cardPayment) {
            cardPayment.hidden = ![
                "Credit Card",
                "Debit Card"
            ].includes(value);
        }

        if (paymentResult) {
            paymentResult.textContent = "";
        }

        const cardDemoResult = byId("cardDemoResult");

        if (cardDemoResult) {
            cardDemoResult.textContent = "";
        }
    }

    paymentMethods.forEach(function (method) {
        method.addEventListener(
            "change",
            updatePaymentMethod
        );
    });

    updatePaymentMethod();

    /* ==========================================
       10. SUBMIT DEMO ORDER
    ========================================== */

    const submitOrderButton =
        byId("submitDemoOrderButton");

    if (submitOrderButton) {
        submitOrderButton.addEventListener(
            "click",
            async function (event) {
                event.preventDefault();

                if (orderSubmissionInProgress) {
                    return;
                }

                const nameInput = byId("quoteName");
                const emailInput = byId("quoteEmail");
                const companyInput = byId("quoteCompany");
                const serviceInput = byId("quoteService");
                const notesInput = byId("quoteMessage");
                const referenceInput = byId("paymentReference");
                const proofInput = byId("paymentProof");

                /* Validate checkout details */

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
                        "Please complete your name, email address, and service package first.",
                        false
                    );

                    byId("quote")?.scrollIntoView({
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

                /* Validate payment method */

                const selectedMethod = document.querySelector(
                    'input[name="paymentMethod"]:checked'
                );

                if (!selectedMethod) {
                    showMessage(
                        paymentResult,
                        "Please select a payment method.",
                        false
                    );

                    return;
                }

                const paymentMethod = selectedMethod.value;

                const isCardPayment = [
                    "Credit Card",
                    "Debit Card"
                ].includes(paymentMethod);

                let demoCardApproved = false;

                /* ------------------------------------------
                   SIMULATED CARD VALIDATION

                   This is a school-project simulation.
                   It does not authorize a real transaction.
                ------------------------------------------ */

                if (isCardPayment) {
                    const cardName =
                        (byId("demoCardName")?.value || "").trim();

                    const cardNumber =
                        (byId("demoCardNumber")?.value || "").trim();

                    const cardExpiry =
                        (byId("demoCardExpiry")?.value || "").trim();

                    const cardCVV =
                        (byId("demoCardCVV")?.value || "").trim();

                    if (!cardName) {
                        showMessage(
                            paymentResult,
                            "Please enter the cardholder name.",
                            false
                        );

                        byId("demoCardName")?.focus();
                        return;
                    }

                    if (!/^[0-9]{16}$/.test(cardNumber)) {
                        showMessage(
                            paymentResult,
                            "The demo card number must contain exactly 16 digits.",
                            false
                        );

                        byId("demoCardNumber")?.focus();
                        return;
                    }

                    if (
                        !/^(0[1-9]|1[0-2])\/[0-9]{2}$/.test(
                            cardExpiry
                        )
                    ) {
                        showMessage(
                            paymentResult,
                            "Enter the expiration date in MM/YY format.",
                            false
                        );

                        byId("demoCardExpiry")?.focus();
                        return;
                    }

                    if (!/^[0-9]{3}$/.test(cardCVV)) {
                        showMessage(
                            paymentResult,
                            "The demo CVV must contain exactly 3 digits.",
                            false
                        );

                        byId("demoCardCVV")?.focus();
                        return;
                    }

                    // Simulated success only.
                    demoCardApproved = true;

                } else {
                    /* Validate GCash/bank receipt */

                    const receiptFile =
                        proofInput?.files?.[0];

                    if (!receiptFile) {
                        showMessage(
                            paymentResult,
                            "Please upload your payment receipt or screenshot.",
                            false
                        );

                        proofInput?.focus();
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

                /* Disable submit button */

                orderSubmissionInProgress = true;

                const originalButtonText =
                    submitOrderButton.textContent;

                submitOrderButton.disabled = true;

                submitOrderButton.textContent =
                    "Submitting order...";

                showMessage(
                    paymentResult,
                    isCardPayment
                        ? "Submitting simulated card payment..."
                        : "Saving your order and receipt...",
                    true
                );

                try {
                    let receipt = null;

                    if (!isCardPayment) {
                        const receiptFile =
                            proofInput.files[0];

                        receipt = {
                            name: receiptFile.name,
                            dataUrl: await fileToDataURL(
                                receiptFile
                            )
                        };
                    }

                    /*
                     * Never include card number, expiry, CVV,
                     * or cardholder name in the backend request.
                     */

                    const orderData = {
                        customerName: nameInput.value.trim(),

                        customerEmail:
                            emailInput.value.trim(),

                        company: companyInput
                            ? companyInput.value.trim()
                            : "",

                        service: serviceInput.value,

                        paymentMethod: paymentMethod,

                        paymentReference: referenceInput
                            ? referenceInput.value.trim()
                            : "",

                        notes: notesInput
                            ? notesInput.value.trim()
                            : "",

                        receipt: receipt,

                        demoCardApproved: demoCardApproved
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

                    const paymentStatus =
                        result.paymentStatus ||
                        (
                            isCardPayment
                                ? "Demo Payment Successful — No Real Charge"
                                : "Awaiting Manual Verification"
                        );

                    const orderStatus =
                        result.status ||
                        "Pending Verification";

                    /* Prepare email details */

                    const emailDetails = {
                        customer_name:
                            nameInput.value.trim(),

                        customer_email:
                            emailInput.value.trim(),

                        company: companyInput
                            ? companyInput.value.trim()
                            : "Not provided",

                        order_id: orderId,

                        service: serviceInput.value,

                        payment_method: paymentMethod,

                        payment_reference: referenceInput
                            ? referenceInput.value.trim()
                            : "Not provided",

                        notes: notesInput
                            ? notesInput.value.trim()
                            : "No additional instructions provided.",

                        status: orderStatus,

                        payment_status: paymentStatus,

                        order_status: orderStatus
                    };

                    /* ======================================
                       SEND ORDER EMAILS TO SEPARATE RECIPIENTS

                       Admin:
                       NEW ORDER RECEIVED

                       Customer:
                       ORDER CONFIRMATION
                    ====================================== */

                    let emailMessage =
                        "\nEmail notifications were not attempted.";

                    if (emailJSReady) {
                        const adminParameters =
                            makeEmailParameters(
                                emailDetails,
                                ADMIN_EMAIL,
                                "NEW ORDER RECEIVED - " +
                                    orderId
                            );

                        const customerParameters =
                            makeEmailParameters(
                                emailDetails,
                                emailInput.value.trim(),
                                "CleanFlow Engineering - Order Confirmation"
                            );

                        // Explicit recipient assignments.
                        adminParameters.to_email = ADMIN_EMAIL;

                        customerParameters.to_email =
                            emailInput.value.trim();

                        const emailResults =
                            await sendBothEmails(
                                adminParameters,
                                customerParameters
                            );

                        emailMessage = emailStatusMessage(
                            emailResults,
                            "order"
                        );

                    } else {
                        emailMessage =
                            "\nThe order was saved, but EmailJS did not initialize. Check the EmailJS SDK in index.html.";
                    }

                    /* Prepare refund form */

                    const refundOrderId =
                        byId("refundOrderId");

                    const refundEmail =
                        byId("refundEmail");

                    if (
                        refundOrderId &&
                        orderId !== "Not provided"
                    ) {
                        refundOrderId.value = orderId;
                    }

                    if (refundEmail) {
                        refundEmail.value =
                            emailInput.value.trim();
                    }

                    /* Clear receipt upload */

                    if (proofInput) {
                        proofInput.value = "";
                    }

                    /* Clear card fields */

                    [
                        "demoCardName",
                        "demoCardNumber",
                        "demoCardExpiry",
                        "demoCardCVV"
                    ].forEach(function (id) {
                        const input = byId(id);

                        if (input) {
                            input.value = "";
                        }
                    });

                    /* Display result */

                    const cardDemoResult =
                        byId("cardDemoResult");

                    let message =
                        "Your CleanFlow demo order was submitted successfully.";

                    if (orderId !== "Not provided") {
                        message +=
                            "\nOrder reference: " + orderId;
                    }

                    if (isCardPayment) {
                        message +=
                            "\nDEMO PAYMENT SUCCESSFUL — NO REAL MONEY WAS CHARGED.";

                        message +=
                            "\nThis is a simulated school-project transaction, not a real bank authorization.";

                        showMessage(
                            cardDemoResult,
                            "Demo payment simulated successfully. No money was charged.",
                            true
                        );

                    } else {
                        message +=
                            "\nPayment status: Awaiting manual verification.";

                        message +=
                            "\nThe administrator must review the uploaded receipt.";
                    }

                    showMessage(
                        paymentResult,
                        message + emailMessage,
                        true
                    );

                } catch (error) {
                    console.error(
                        "Order submission error:",
                        error
                    );

                    showMessage(
                        paymentResult,
                        error.message ||
                            "Could not submit your order.",
                        false
                    );

                } finally {
                    orderSubmissionInProgress = false;

                    submitOrderButton.disabled = false;

                    submitOrderButton.textContent =
                        originalButtonText ||
                        "Submit Demo Order";
                }
            }
        );
    }

    /* ==========================================
       11. REFUND REQUEST FORM
    ========================================== */

    const refundForm = byId("refundForm");
    const refundResult = byId("refundResult");

    if (refundForm) {
        refundForm.addEventListener(
            "submit",
            async function (event) {
                event.preventDefault();

                if (refundSubmissionInProgress) {
                    return;
                }

                if (!refundForm.reportValidity()) {
                    return;
                }

                const orderId =
                    byId("refundOrderId")?.value.trim() || "";

                const customerEmail =
                    byId("refundEmail")?.value.trim() || "";

                const reason =
                    byId("refundReason")?.value.trim() || "";

                if (!orderId || !customerEmail || !reason) {
                    showMessage(
                        refundResult,
                        "Enter your order reference, email address, and refund reason.",
                        false
                    );

                    return;
                }

                if (
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                        customerEmail
                    )
                ) {
                    showMessage(
                        refundResult,
                        "Enter a valid email address.",
                        false
                    );

                    return;
                }

                refundSubmissionInProgress = true;

                const refundButton =
                    refundForm.querySelector(
                        'button[type="submit"]'
                    );

                const originalButtonText = refundButton
                    ? refundButton.textContent
                    : "";

                if (refundButton) {
                    refundButton.disabled = true;

                    refundButton.textContent =
                        "Submitting request...";
                }

                showMessage(
                    refundResult,
                    "Submitting refund request...",
                    true
                );

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
                            customer_name:
                                "CleanFlow customer",

                            customer_email:
                                customerEmail,

                            company: "Not provided",

                            order_id: orderId,

                            service: "Refund request",

                            payment_method: "Not applicable",

                            payment_reference: "Not applicable",

                            notes:
                                "Refund request submitted for administrator review.",

                            status:
                                result.status ||
                                "Pending Review",

                            refund_status:
                                result.status ||
                                "Pending Review",

                            refund_id: refundId,

                            reason: reason
                        };

                        /*
                         * Admin receives the new refund request.
                         * Customer receives only their confirmation.
                         */

                        const adminParameters =
                            makeEmailParameters(
                                refundDetails,
                                ADMIN_EMAIL,
                                "NEW REFUND REQUEST - " +
                                    refundId
                            );

                        const customerParameters =
                            makeEmailParameters(
                                refundDetails,
                                customerEmail,
                                "CleanFlow Refund Request Received - " +
                                    refundId
                            );

                        adminParameters.to_email =
                            ADMIN_EMAIL;

                        customerParameters.to_email =
                            customerEmail;

                        const emailResults =
                            await sendBothEmails(
                                adminParameters,
                                customerParameters
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
                        message +=
                            "\nRefund reference: " + refundId;
                    }

                    message +=
                        "\nNo money has been refunded automatically. The administrator must review the request.";

                    showMessage(
                        refundResult,
                        message + emailMessage,
                        true
                    );

                } catch (error) {
                    console.error(
                        "Refund request error:",
                        error
                    );

                    showMessage(
                        refundResult,
                        error.message ||
                            "Could not submit your refund request.",
                        false
                    );

                } finally {
                    refundSubmissionInProgress = false;

                    if (refundButton) {
                        refundButton.disabled = false;

                        refundButton.textContent =
                            originalButtonText ||
                            "Submit Refund Request";
                    }
                }
            }
        );
    }

    /* ==========================================
       12. BACKEND HEALTH CHECK
    ========================================== */

    fetch("/api/health", {
        cache: "no-store"
    })
        .then(async function (response) {
            const body = await response.text();

            console.log(
                "CleanFlow health status:",
                response.status
            );

            console.log(
                "CleanFlow health response:",
                body
            );

            if (!response.ok) {
                throw new Error(
                    "Health endpoint returned HTTP " +
                    response.status
                );
            }
        })
        .catch(function (error) {
            console.warn(
                "Backend health check failed. Verify server.js and the OneCompiler preview.",
                error
            );
        });
});
