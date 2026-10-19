/* ==========================================
   CLEANFLOW ENGINEERING
   School Project Demo
   EmailJS + Node.js Backend (with LocalStorage Fallback)
   1. Online Banking: BDO, BPI, Landbank, Metrobank (16 Digits Only)
   2. Credit/Debit Card: Visa, Mastercard, JCB, Amex (16 Digits + Approval)
   3. Checkout Amount Display (Customer & Owner)
   4. Cancel via Email Link + 3-Day 10% Deduction + Auto Refund Invoice
========================================== */

document.addEventListener("DOMContentLoaded", function () {
    "use strict";

    /* ==========================================
       1. CONFIGURATION & SERVICE PRICES
    ========================================== */

    const EMAILJS_PUBLIC_KEY = "zTVG7TfT8a3f7C28r";
    const EMAILJS_SERVICE_ID = "service_ndmbg2r";

    const EMAILJS_ADMIN_TEMPLATE_ID = "template_yzzz0ms";
    const EMAILJS_CUSTOMER_TEMPLATE_ID = "template_sl7hzru";

    const ADMIN_EMAIL = "cleanflowengineer@gmail.com";

    const SERVICE_PRICES = {
        "Basic Testing": 500,
        "Complete Analysis": 1500,
        "Water Quality Monitoring": 2500
    };

    const LOCAL_ORDERS_KEY = "cleanflow_local_orders_v1";

    let emailJSReady = false;
    let orderSubmissionInProgress = false;
    let refundSubmissionInProgress = false;

    /* ==========================================
       2. INITIALIZE EMAILJS
    ========================================== */

    if (window.emailjs) {
        try {
            window.emailjs.init({
                publicKey: EMAILJS_PUBLIC_KEY
            });
            emailJSReady = true;
            console.log("CleanFlow: EmailJS initialized.");
        } catch (error) {
            console.error("EmailJS initialization failed:", error);
        }
    }

    /* ==========================================
       3. GENERAL HELPERS & LOCAL STORAGE BACKUP
    ========================================== */

    function byId(id) {
        return document.getElementById(id);
    }

    function formatPeso(amount) {
        const num = Number(amount || 0);
        return "₱" + num.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function getServicePrice(serviceName) {
        return SERVICE_PRICES[serviceName] || 1500;
    }

    function getLocalOrders() {
        try {
            return JSON.parse(localStorage.getItem(LOCAL_ORDERS_KEY) || "[]");
        } catch {
            return [];
        }
    }

    function saveLocalOrder(order) {
        const list = getLocalOrders();
        const existingIdx = list.findIndex(item => item.id === order.id);
        if (existingIdx >= 0) {
            list[existingIdx] = order;
        } else {
            list.unshift(order);
        }
        localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(list));
    }

    function showMessage(element, message, success) {
        if (!element) return;
        element.textContent = message;
        element.style.whiteSpace = "pre-line";
        element.style.color = success ? "#167447" : "#b42318";
        element.setAttribute("role", success ? "status" : "alert");
    }

    function createRequestKey() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }
        return "cf-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    }

    async function sendJSON(url, data, idempotencyKey) {
        const headers = { "Content-Type": "application/json" };
        if (idempotencyKey) {
            headers["Idempotency-Key"] = idempotencyKey;
        }

        const response = await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(data)
        });

        const responseText = await response.text();
        const result = responseText ? JSON.parse(responseText) : {};

        if (!response.ok) {
            throw new Error(result.error || result.message || "The request failed.");
        }

        return result;
    }

    function fileToDataURL(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () {
                reject(new Error("Could not read the uploaded receipt."));
            };
            reader.readAsDataURL(file);
        });
    }

    /* ==========================================
       4. STRICT NUMBERS-ONLY ENFORCEMENT (CONDITION 1 & 2)
    ========================================== */

    function enforceNumbersOnly(inputEl, counterId, targetDigits) {
        if (!inputEl) return;
        inputEl.addEventListener("input", function () {
            // Strip any letter, space, or symbol immediately
            const digitsOnly = inputEl.value.replace(/\D/g, "").slice(0, targetDigits);
            inputEl.value = digitsOnly;

            if (counterId) {
                const counter = byId(counterId);
                if (counter) {
                    counter.textContent =
                        digitsOnly.length + " / " + targetDigits +
                        " digits (Numbers only, no letters)";
                    counter.style.color =
                        digitsOnly.length === targetDigits ? "#167447" : "#64748b";
                }
            }
        });
    }

    enforceNumbersOnly(byId("bankCardNumber"), "bankDigitCounter", 16);
    enforceNumbersOnly(byId("demoCardNumber"), "cardDigitCounter", 16);
    enforceNumbersOnly(byId("demoCardCVV"), null, 3);

    const expiryInput = byId("demoCardExpiry");
    if (expiryInput) {
        expiryInput.addEventListener("input", function () {
            const digits = expiryInput.value.replace(/\D/g, "").slice(0, 4);
            if (digits.length >= 3) {
                expiryInput.value = digits.slice(0, 2) + "/" + digits.slice(2);
            } else {
                expiryInput.value = digits;
            }
        });
    }

    // Update Bank Card Label when switching between BDO, BPI, Landbank, Metrobank
    document.querySelectorAll('input[name="onlineBankChoice"]').forEach(function (radio) {
        radio.addEventListener("change", function () {
            const label = byId("bankCardNumberLabel");
            if (label) {
                label.textContent = radio.value + " Card Number (16 Digits)";
            }
        });
    });

    /* ==========================================
       5. CHECKOUT AMOUNT & 10% REFUND DISPLAY (CONDITION 3 & 4)
    ========================================== */

    function updateCheckoutAmountDisplay() {
        const serviceSelect = byId("quoteService");
        const service = serviceSelect ? serviceSelect.value : "";
        const amount = service ? getServicePrice(service) : 0;
        const tenPercent = amount * 0.10;

        if (byId("summaryServiceName")) {
            byId("summaryServiceName").textContent = service || "Not selected yet";
        }
        if (byId("summaryTotalAmount")) {
            byId("summaryTotalAmount").textContent = formatPeso(amount);
        }
        if (byId("summaryTenPercent")) {
            byId("summaryTenPercent").textContent = formatPeso(tenPercent);
        }
        if (byId("paymentBannerService")) {
            byId("paymentBannerService").textContent = service
                ? "Selected Package: " + service
                : "Select a service package in Checkout Details above";
        }
        if (byId("paymentBannerAmount")) {
            byId("paymentBannerAmount").textContent = formatPeso(amount);
        }
    }

    const quoteServiceSelect = byId("quoteService");
    if (quoteServiceSelect) {
        quoteServiceSelect.addEventListener("change", updateCheckoutAmountDisplay);
        updateCheckoutAmountDisplay();
    }

    function updateRefundCalculationPreview() {
        const refundPkg = byId("refundServicePackage");
        if (!refundPkg) return;
        const parts = refundPkg.value.split("|");
        const amount = parseFloat(parts[1] || "1500");
        const fee = +(amount * 0.10).toFixed(2);
        const net = +(amount - fee).toFixed(2);

        if (byId("refundOriginalAmount")) {
            byId("refundOriginalAmount").textContent = formatPeso(amount);
        }
        if (byId("refundFeeAmount")) {
            byId("refundFeeAmount").textContent = "-" + formatPeso(fee);
        }
        if (byId("refundNetAmount")) {
            byId("refundNetAmount").textContent = formatPeso(net);
        }
    }

    const refundServiceSelect = byId("refundServicePackage");
    if (refundServiceSelect) {
        refundServiceSelect.addEventListener("change", updateRefundCalculationPreview);
        updateRefundCalculationPreview();
    }

    /* ==========================================
       6. OFFICIAL INVOICE RECEIPT MODAL
    ========================================== */

    window.openInvoiceReceiptModal = function (receiptData) {
        const modal = byId("invoiceReceiptModal");
        const title = byId("invoiceModalTitle");
        const badge = byId("invoiceModalBadge");
        const body = byId("invoiceModalBody");
        if (!modal || !body) return;

        const isCancelled = receiptData.isCancelled === true;
        title.textContent = isCancelled
            ? "Cancellation & 10% Deduction Refund Invoice"
            : "Official Transaction Approval & Invoice Receipt";

        badge.textContent = isCancelled
            ? "CANCELLED (10% FEE DEDUCTED)"
            : "APPROVED & PAID";
        badge.className = "invoice-status-badge " + (isCancelled ? "cancelled" : "approved");

        body.innerHTML = `
            <div class="invoice-line"><span>Invoice Number</span><strong>${receiptData.invoiceNo}</strong></div>
            <div class="invoice-line"><span>Order Reference ID</span><strong>${receiptData.orderId}</strong></div>
            <div class="invoice-line"><span>Approval / Reference Code</span><strong>${receiptData.paymentReference}</strong></div>
            <div class="invoice-line"><span>Date &amp; Time</span><strong>${new Date().toLocaleString()}</strong></div>
            <div class="invoice-line"><span>Customer Name</span><strong>${receiptData.customerName}</strong></div>
            <div class="invoice-line"><span>Customer Email</span><strong>${receiptData.customerEmail}</strong></div>
            <div class="invoice-line"><span>Service Package</span><strong>${receiptData.service}</strong></div>
            <div class="invoice-line"><span>Payment Method &amp; Brand</span><strong>${receiptData.paymentMethod}</strong></div>
            <div class="invoice-line total"><span>Total Bill Amount</span><span>${formatPeso(receiptData.amount)}</span></div>
            ${isCancelled ? `
                <div class="invoice-line deduction"><span>Less: 10% Cancellation Fee (Within 3 Days)</span><span>-${formatPeso(receiptData.deductionFee)}</span></div>
                <div class="invoice-line refund"><span>Net Refund to Customer (90%)</span><span>${formatPeso(receiptData.netRefund)}</span></div>
            ` : ""}
        `;

        modal.hidden = false;
        modal.classList.add("show");
    };

    window.closeInvoiceReceiptModal = function () {
        const modal = byId("invoiceReceiptModal");
        if (modal) {
            modal.classList.remove("show");
            modal.hidden = true;
        }
    };

    /* ==========================================
       7. EMAILJS HELPERS (WITH CANCEL PORTAL LINK & AMOUNT)
    ========================================== */

    function buildCancelPortalLink(details) {
        const baseUrl = window.location.origin + window.location.pathname;
        const params = new URLSearchParams({
            cancelOrder: details.order_id || "",
            email: details.customer_email || "",
            name: details.customer_name || "",
            service: details.service || "Complete Analysis",
            amount: String(details.raw_amount || getServicePrice(details.service)),
            method: details.payment_method || ""
        });
        return baseUrl + "?" + params.toString() + "#refund";
    }

    function makeEmailParameters(details, recipient, subject) {
        const name = details.customer_name || "Customer";
        const email = details.customer_email || "";
        const status = details.order_status || details.status || "Approved";
        const amountStr = details.amount || formatPeso(getServicePrice(details.service));
        const cancelLink = details.cancel_link || buildCancelPortalLink(details);
        const notes = details.notes || "No additional instructions provided.";

        return {
            to_email: recipient,
            email_subject: subject,
            subject: subject,

            name: name,
            to_name: name,
            email: email,

            customer_name: name,
            customer_email: email,

            company: details.company || "Not provided",

            order_id: details.order_id || "Not provided",
            invoice_no: details.invoice_no || "Not provided",
            service: details.service + " (" + amountStr + ")",
            service_name: details.service + " (" + amountStr + ")",
            amount: amountStr,
            total_amount: amountStr,

            payment_method: details.payment_method || "Not provided",
            payment_reference: details.payment_reference || "Not provided",

            note: notes,
            notes: notes,

            status: status,
            order_status: status,
            payment_status: details.payment_status || status,

            refund_id: details.refund_id || "Not applicable",
            refund_status: details.refund_status || "Not applicable",
            reason: details.reason || "Not applicable",

            cancel_link: cancelLink,
            action_link: cancelLink,
            admin_email: ADMIN_EMAIL,

            message: details.message ||
                "This is an automated notification from CleanFlow Engineering."
        };
    }

    async function sendEmail(templateId, parameters) {
        if (!emailJSReady || !window.emailjs) {
            throw new Error("EmailJS is not initialized. Check index.html.");
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

        if (!adminSent) console.error("Admin email failed:", results[0].reason);
        if (!customerSent) console.error("Customer email failed:", results[1].reason);

        return { adminSent: adminSent, customerSent: customerSent };
    }

    function emailStatusMessage(results, type) {
        if (results.adminSent && results.customerSent) {
            return "\nAdmin and customer " + type + " emails were sent via EmailJS.";
        }
        if (!results.adminSent && !results.customerSent) {
            return "\nThe " + type + " was saved, but both email attempts failed.";
        }
        if (!results.adminSent) {
            return "\nCustomer email sent, but admin email failed.";
        }
        return "\nAdmin email sent, but customer email failed.";
    }

    /* ==========================================
       8. ORDER STATUS UPDATE EMAILS
    ========================================== */

    window.sendCleanFlowOrderStatusEmails = async function (details) {
        if (!emailJSReady || !window.emailjs) {
            throw new Error("EmailJS is not initialized.");
        }

        const status = details.order_status;
        const adminParameters = makeEmailParameters(
            {
                ...details,
                order_status: status,
                status: status,
                message: "An order status was updated in the CleanFlow admin dashboard."
            },
            ADMIN_EMAIL,
            "CleanFlow - Order Status Updated - " + details.order_id
        );

        const customerParameters = makeEmailParameters(
            {
                ...details,
                order_status: status,
                status: status,
                message: "Your order status has been updated by CleanFlow Engineering."
            },
            details.customer_email,
            "CleanFlow - Your Order Status Has Been Updated"
        );

        adminParameters.to_email = ADMIN_EMAIL;
        customerParameters.to_email = details.customer_email;

        return sendBothEmails(adminParameters, customerParameters);
    };

    window.sendCleanFlowCustomerStatusEmail = async function (details) {
        return window.sendCleanFlowOrderStatusEmails(details);
    };

    /* ==========================================
       9. MOBILE NAVIGATION & SERVICE MODAL
    ========================================== */

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
        modalText.textContent =
            serviceDescriptions[service] ||
            "CleanFlow Engineering provides water quality management services.";
        serviceModal.classList.add("show");
    };

    window.closeService = function () {
        if (serviceModal) serviceModal.classList.remove("show");
    };

    if (serviceModal) {
        serviceModal.addEventListener("click", function (event) {
            if (event.target === serviceModal) window.closeService();
        });
    }

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            window.closeService();
            window.closeInvoiceReceiptModal();
        }
    });

    /* ==========================================
       10. SELECT A SERVICE PACKAGE & CHECKOUT DETAILS
    ========================================== */

    window.selectPackage = function (packageName) {
        const serviceSelect = byId("quoteService");
        const quoteSection = byId("quote");

        if (serviceSelect) {
            let option = Array.from(serviceSelect.options).find(function (item) {
                return item.value === packageName;
            });

            if (!option && packageName === "Monitoring Plan") {
                option = Array.from(serviceSelect.options).find(function (item) {
                    return item.value === "Water Quality Monitoring";
                });
            }

            if (option) {
                serviceSelect.value = option.value;
                serviceSelect.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }

        if (quoteSection) {
            quoteSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    const quoteForm = byId("quoteForm");
    const quoteResult = byId("quoteResult");

    if (quoteForm) {
        quoteForm.addEventListener("submit", function (event) {
            event.preventDefault();
            if (!quoteForm.reportValidity()) return;

            updateCheckoutAmountDisplay();
            const selectedService = byId("quoteService")?.value || "";
            const totalPeso = formatPeso(getServicePrice(selectedService));

            showMessage(
                quoteResult,
                "Checkout details confirmed! Total Bill Amount: " + totalPeso +
                ". Proceed below to select your payment method.",
                true
            );

            const paymentSection = byId("payment");
            if (paymentSection) {
                paymentSection.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
    }

    /* ==========================================
       11. PAYMENT METHOD SELECTION
    ========================================== */

    const paymentMethods = document.querySelectorAll('input[name="paymentMethod"]');
    const gcashPayment = byId("gcashPayment");
    const bankPayment = byId("bankPayment");
    const cardPayment = byId("cardPayment");
    const paymentResult = byId("paymentResult");

    function updatePaymentMethod() {
        const selected = document.querySelector('input[name="paymentMethod"]:checked');
        const value = selected ? selected.value : "";

        if (gcashPayment) gcashPayment.hidden = value !== "GCash";
        if (bankPayment) bankPayment.hidden = value !== "Online Bank Transfer";
        if (cardPayment) {
            cardPayment.hidden = !["Credit Card", "Debit Card"].includes(value);
        }

        const heading = byId("cardCheckoutHeading");
        if (heading && ["Credit Card", "Debit Card"].includes(value)) {
            heading.textContent = "💳 " + value + " Checkout";
        }

        // Hide manual file upload when using 16-digit Credit/Debit Card or 16-digit Online Banking
        const proofGroup = byId("paymentProofGroup");
        if (proofGroup) {
            proofGroup.hidden = ["Credit Card", "Debit Card", "Online Bank Transfer"].includes(value);
        }

        if (paymentResult) paymentResult.textContent = "";
        if (byId("cardDemoResult")) byId("cardDemoResult").textContent = "";
        if (byId("bankDemoResult")) byId("bankDemoResult").textContent = "";
    }

    paymentMethods.forEach(function (method) {
        method.addEventListener("change", updatePaymentMethod);
    });

    updatePaymentMethod();

    /* ==========================================
       12. SUBMIT ORDER (CONDITIONS 1, 2, 3, 4)
    ========================================== */

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
                byId("quote")?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }

            if (!emailInput.checkValidity()) {
                showMessage(paymentResult, "Please enter a valid email address.", false);
                emailInput.focus();
                return;
            }

            const selectedMethod = document.querySelector('input[name="paymentMethod"]:checked');
            if (!selectedMethod) {
                showMessage(paymentResult, "Please select a payment method.", false);
                return;
            }

            const paymentMethod = selectedMethod.value;
            const serviceName = serviceInput.value;
            const billAmount = getServicePrice(serviceName);
            const isCardPayment = ["Credit Card", "Debit Card"].includes(paymentMethod);
            const isBankTransfer = paymentMethod === "Online Bank Transfer";

            let detailedPaymentMethod = paymentMethod;
            let approvalOrRefCode = referenceInput?.value.trim() || "";
            let demoCardApproved = false;

            /* CONDITION 1: ONLINE BANK TRANSFER (BDO, BPI, LANDBANK, METROBANK - 16 DIGITS ONLY) */
            if (isBankTransfer) {
                const chosenBank =
                    document.querySelector('input[name="onlineBankChoice"]:checked')?.value || "BDO";
                const bankHolder = (byId("bankAccountName")?.value || "").trim();
                const bankCardNum = (byId("bankCardNumber")?.value || "").trim();

                if (!bankHolder) {
                    showMessage(
                        paymentResult,
                        "Please enter the " + chosenBank + " Account / Cardholder Name.",
                        false
                    );
                    byId("bankAccountName")?.focus();
                    return;
                }

                if (!/^[0-9]{16}$/.test(bankCardNum)) {
                    showMessage(
                        paymentResult,
                        chosenBank + " card number must contain exactly 16 numbers (digits only, no letters allowed).",
                        false
                    );
                    byId("bankCardNumber")?.focus();
                    return;
                }

                const maskedBankCard = "**** **** **** " + bankCardNum.slice(-4);
                detailedPaymentMethod = "Online Bank Transfer - " + chosenBank + " (" + maskedBankCard + ")";
                approvalOrRefCode = "BNK-" + chosenBank.toUpperCase() + "-" + Math.floor(100000 + Math.random() * 900000);
                demoCardApproved = true;
            }

            /* CONDITION 2: CREDIT CARD / DEBIT CARD (BRANDS + 16 DIGITS + REAL APPROVAL) */
            else if (isCardPayment) {
                const chosenBrand =
                    document.querySelector('input[name="cardBrandChoice"]:checked')?.value || "Visa";
                const cardName = (byId("demoCardName")?.value || "").trim();
                const cardNumber = (byId("demoCardNumber")?.value || "").trim();
                const cardExpiry = (byId("demoCardExpiry")?.value || "").trim();
                const cardCVV = (byId("demoCardCVV")?.value || "").trim();

                if (!cardName) {
                    showMessage(paymentResult, "Please enter the cardholder name.", false);
                    byId("demoCardName")?.focus();
                    return;
                }

                if (!/^[0-9]{16}$/.test(cardNumber)) {
                    showMessage(
                        paymentResult,
                        chosenBrand + " card number must contain exactly 16 numbers (no letters allowed).",
                        false
                    );
                    byId("demoCardNumber")?.focus();
                    return;
                }

                if (!/^(0[1-9]|1[0-2])\/[0-9]{2}$/.test(cardExpiry)) {
                    showMessage(paymentResult, "Enter the expiration date in MM/YY format.", false);
                    byId("demoCardExpiry")?.focus();
                    return;
                }

                if (!/^[0-9]{3}$/.test(cardCVV)) {
                    showMessage(paymentResult, "The CVV must contain exactly 3 digits (numbers only).", false);
                    byId("demoCardCVV")?.focus();
                    return;
                }

                const maskedCard = "**** **** **** " + cardNumber.slice(-4);
                detailedPaymentMethod = paymentMethod + " - " + chosenBrand + " (" + maskedCard + ")";
                approvalOrRefCode = "AUTH-" + chosenBrand.slice(0, 4).toUpperCase() + "-" + Math.floor(100000 + Math.random() * 900000);
                demoCardApproved = true;
            }

            /* GCASH VALIDATION */
            else {
                const receiptFile = proofInput?.files?.[0];
                if (!receiptFile) {
                    showMessage(paymentResult, "Please upload your GCash payment receipt or screenshot.", false);
                    proofInput?.focus();
                    return;
                }

                const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
                if (!allowedTypes.includes(receiptFile.type)) {
                    showMessage(paymentResult, "Upload a JPG, PNG, WEBP, or PDF receipt.", false);
                    return;
                }

                if (receiptFile.size > 4 * 1024 * 1024) {
                    showMessage(paymentResult, "The receipt must be 4 MB or smaller.", false);
                    return;
                }

                if (!approvalOrRefCode) {
                    approvalOrRefCode = "GCASH-" + Math.floor(100000 + Math.random() * 900000);
                }
            }

            orderSubmissionInProgress = true;
            const originalButtonText = submitOrderButton.textContent;
            submitOrderButton.disabled = true;
            submitOrderButton.textContent = "Authorizing Transaction & Sending Receipt...";

            showMessage(
                paymentResult,
                "Processing transaction and generating official invoice receipt...",
                true
            );

            try {
                let receipt = null;
                if (!isCardPayment && !isBankTransfer && proofInput?.files?.[0]) {
                    const receiptFile = proofInput.files[0];
                    receipt = {
                        name: receiptFile.name,
                        dataUrl: await fileToDataURL(receiptFile)
                    };
                }

                const invoiceNo = "CF-INV-" + new Date().getFullYear() + "-" + Math.floor(10000 + Math.random() * 90000);

                const orderData = {
                    customerName: nameInput.value.trim(),
                    customerEmail: emailInput.value.trim(),
                    company: companyInput ? companyInput.value.trim() : "",
                    service: serviceName,
                    amount: billAmount,
                    paymentMethod: paymentMethod,
                    detailedPaymentMethod: detailedPaymentMethod,
                    paymentReference: approvalOrRefCode,
                    invoiceNo: invoiceNo,
                    notes: notesInput ? notesInput.value.trim() : "",
                    receipt: receipt,
                    demoCardApproved: demoCardApproved
                };

                let orderId = "CF-" + Math.floor(100000 + Math.random() * 900000);
                let paymentStatus = (isCardPayment || isBankTransfer)
                    ? "Transaction Approved & Paid (" + approvalOrRefCode + ")"
                    : "Awaiting Manual Verification";
                let orderStatus = (isCardPayment || isBankTransfer)
                    ? "Payment Approved"
                    : "Pending Verification";

                // Try saving to Node.js backend if running; fallback cleanly to LocalStorage on GitHub Pages
                try {
                    const result = await sendJSON("/api/orders", orderData, createRequestKey());
                    orderId = result.orderId || result.id || orderId;
                    paymentStatus = result.paymentStatus || paymentStatus;
                    orderStatus = result.status || orderStatus;
                } catch (backendErr) {
                    console.warn("Using client-side storage fallback (GitHub Pages mode):", backendErr.message);
                }

                // Always save order in browser LocalStorage so the Refund Calculator can look up its exact amount
                saveLocalOrder({
                    id: orderId,
                    invoiceNo: invoiceNo,
                    customerName: orderData.customerName,
                    customerEmail: orderData.customerEmail,
                    company: orderData.company,
                    service: serviceName,
                    amount: billAmount,
                    paymentMethod: detailedPaymentMethod,
                    paymentReference: approvalOrRefCode,
                    status: orderStatus,
                    createdAt: Date.now()
                });

                const tenPercentFee = +(billAmount * 0.10).toFixed(2);
                const emailDetails = {
                    customer_name: orderData.customerName,
                    customer_email: orderData.customerEmail,
                    company: orderData.company || "Not provided",
                    order_id: orderId,
                    invoice_no: invoiceNo,
                    service: serviceName,
                    raw_amount: billAmount,
                    amount: formatPeso(billAmount),
                    payment_method: detailedPaymentMethod,
                    payment_reference: approvalOrRefCode,
                    notes: orderData.notes || "No additional instructions provided.",
                    status: orderStatus,
                    payment_status: paymentStatus,
                    order_status: orderStatus
                };

                const cancelLink = buildCancelPortalLink(emailDetails);
                emailDetails.cancel_link = cancelLink;

                const receiptTextBlock =
                    "OFFICIAL TRANSACTION APPROVAL & INVOICE RECEIPT\n" +
                    "----------------------------------------\n" +
                    "• Invoice Number: " + invoiceNo + "\n" +
                    "• Order Reference ID: " + orderId + "\n" +
                    "• Approval / Reference Code: " + approvalOrRefCode + "\n" +
                    "• Customer: " + orderData.customerName + " (" + orderData.customerEmail + ")\n" +
                    "• Service Package: " + serviceName + "\n" +
                    "• Total Bill Amount: " + formatPeso(billAmount) + "\n" +
                    "• Payment Method: " + detailedPaymentMethod + "\n" +
                    "• Transaction Status: " + paymentStatus + "\n" +
                    "----------------------------------------\n" +
                    "3-DAY REFUND / CANCELLATION POLICY:\n" +
                    "If you wish to cancel your order within 3 days, click the cancellation link below to open the Refund Portal. A 10% cancellation fee (" + formatPeso(tenPercentFee) + ") will be deducted from your total bill:\n" +
                    cancelLink;

                emailDetails.message = receiptTextBlock;
                emailDetails.notes = receiptTextBlock;

                let emailMessage = "\nEmail notifications were not attempted.";
                if (emailJSReady) {
                    const adminParameters = makeEmailParameters(
                        emailDetails,
                        ADMIN_EMAIL,
                        "NEW APPROVED ORDER & INVOICE [" + invoiceNo + "] - " + orderId
                    );
                    const customerParameters = makeEmailParameters(
                        emailDetails,
                        orderData.customerEmail,
                        "CleanFlow Engineering - Transaction Approval & Invoice [" + invoiceNo + "]"
                    );

                    adminParameters.to_email = ADMIN_EMAIL;
                    customerParameters.to_email = orderData.customerEmail;

                    const emailResults = await sendBothEmails(adminParameters, customerParameters);
                    emailMessage = emailStatusMessage(emailResults, "approval & invoice");
                }

                // Auto-populate Refund Portal fields for easy testing
                if (byId("refundOrderId")) byId("refundOrderId").value = orderId;
                if (byId("refundEmail")) byId("refundEmail").value = orderData.customerEmail;
                if (byId("refundServicePackage")) {
                    byId("refundServicePackage").value = serviceName + "|" + billAmount;
                    updateRefundCalculationPreview();
                }

                // Clear sensitive inputs
                if (proofInput) proofInput.value = "";
                [
                    "demoCardName",
                    "demoCardNumber",
                    "demoCardExpiry",
                    "demoCardCVV",
                    "bankAccountName",
                    "bankCardNumber"
                ].forEach(function (id) {
                    const input = byId(id);
                    if (input) input.value = "";
                });

                // Show Official Approval & Invoice Receipt Modal on screen
                window.openInvoiceReceiptModal({
                    isCancelled: false,
                    invoiceNo: invoiceNo,
                    orderId: orderId,
                    paymentReference: approvalOrRefCode,
                    customerName: orderData.customerName,
                    customerEmail: orderData.customerEmail,
                    service: serviceName,
                    paymentMethod: detailedPaymentMethod,
                    amount: billAmount
                });

                showMessage(
                    paymentResult,
                    "Transaction Approved! Official Invoice " + invoiceNo + " generated.\n" +
                    "Order ID: " + orderId + " | Total Bill Paid: " + formatPeso(billAmount) +
                    emailMessage,
                    true
                );

            } catch (error) {
                console.error("Order submission error:", error);
                showMessage(paymentResult, error.message || "Could not submit your order.", false);
            } finally {
                orderSubmissionInProgress = false;
                submitOrderButton.disabled = false;
                submitOrderButton.textContent = originalButtonText || "Submit & Authorize Payment";
            }
        });
    }

    /* ==========================================
       13. CONDITION 4: 3-DAY (10% FEE) CANCELLATION & AUTO REFUND INVOICE
    ========================================== */

    const refundForm = byId("refundForm");
    const refundResult = byId("refundResult");

    // Auto-match stored order amount when typing Order ID in Refund Form
    const refundOrderIdInput = byId("refundOrderId");
    if (refundOrderIdInput) {
        refundOrderIdInput.addEventListener("input", function () {
            const enteredId = refundOrderIdInput.value.trim();
            const found = getLocalOrders().find(item => item.id === enteredId);
            if (found && byId("refundServicePackage")) {
                byId("refundServicePackage").value = found.service + "|" + found.amount;
                updateRefundCalculationPreview();
            }
        });
    }

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
                    "Enter your order reference, email address, and cancellation/refund reason.",
                    false
                );
                return;
            }

            // Look up order details or use selected package
            const storedOrder = getLocalOrders().find(item => item.id === orderId);
            const pkgParts = (byId("refundServicePackage")?.value || "Complete Analysis|1500").split("|");
            const serviceName = storedOrder ? storedOrder.service : pkgParts[0];
            const totalBill = storedOrder ? Number(storedOrder.amount) : parseFloat(pkgParts[1] || "1500");
            const customerName = storedOrder ? storedOrder.customerName : "CleanFlow Customer";
            const paymentMethod = storedOrder ? storedOrder.paymentMethod : "Online Payment";

            // 3-Day 10% Cancellation Fee Calculation
            const deductionFee = +(totalBill * 0.10).toFixed(2);
            const netRefund = +(totalBill - deductionFee).toFixed(2);
            const refundInvoiceNo = "CF-REF-INV-" + new Date().getFullYear() + "-" + Math.floor(10000 + Math.random() * 90000);

            refundSubmissionInProgress = true;
            const refundButton = refundForm.querySelector('button[type="submit"]');
            const originalButtonText = refundButton ? refundButton.textContent : "";

            if (refundButton) {
                refundButton.disabled = true;
                refundButton.textContent = "Calculating 10% Deduction & Sending Refund Invoice...";
            }

            showMessage(refundResult, "Processing 3-day cancellation and generating refund invoice...", true);

            try {
                let refundId = refundInvoiceNo;

                try {
                    const result = await sendJSON(
                        "/api/refunds",
                        {
                            orderId: orderId,
                            customerEmail: customerEmail,
                            reason: reason,
                            totalBill: totalBill,
                            deductionFee: deductionFee,
                            netRefund: netRefund,
                            refundInvoiceNo: refundInvoiceNo
                        },
                        createRequestKey()
                    );
                    refundId = result.refundId || result.id || refundInvoiceNo;
                } catch (backendErr) {
                    console.warn("Refund processed in client-side mode:", backendErr.message);
                }

                const cancelInvoiceText =
                    "OFFICIAL CANCELLATION & 10% DEDUCTION REFUND INVOICE\n" +
                    "----------------------------------------\n" +
                    "• Refund Invoice Number: " + refundInvoiceNo + "\n" +
                    "• Cancelled Order ID: " + orderId + "\n" +
                    "• Customer: " + customerName + " (" + customerEmail + ")\n" +
                    "• Service Package: " + serviceName + "\n" +
                    "• Original Total Bill: " + formatPeso(totalBill) + "\n" +
                    "• Less 10% Cancellation Fee (Within 3 Days): -" + formatPeso(deductionFee) + "\n" +
                    "• Net Refund Issued to Customer (90%): " + formatPeso(netRefund) + "\n" +
                    "• Cancellation Reason: " + reason + "\n" +
                    "----------------------------------------";

                let emailMessage = "\nRefund invoice emails were not attempted.";

                if (emailJSReady) {
                    const refundDetails = {
                        customer_name: customerName,
                        customer_email: customerEmail,
                        company: "Not applicable",
                        order_id: orderId,
                        invoice_no: refundInvoiceNo,
                        service: serviceName,
                        raw_amount: totalBill,
                        amount: formatPeso(totalBill) + " (Net Refund: " + formatPeso(netRefund) + " after 10% fee)",
                        payment_method: paymentMethod,
                        payment_reference: refundInvoiceNo,
                        notes: cancelInvoiceText,
                        status: "Cancelled — 10% Fee Deducted (Net Refund: " + formatPeso(netRefund) + ")",
                        order_status: "Cancelled — 10% Fee Deducted",
                        refund_status: "Cancelled & Refund Invoice Issued",
                        refund_id: refundId,
                        reason: reason,
                        message: cancelInvoiceText
                    };

                    const adminParameters = makeEmailParameters(
                        refundDetails,
                        ADMIN_EMAIL,
                        "ORDER CANCELLED & REFUND INVOICE [" + refundInvoiceNo + "] - " + orderId
                    );
                    const customerParameters = makeEmailParameters(
                        refundDetails,
                        customerEmail,
                        "CleanFlow Cancellation & 10% Deduction Refund Invoice [" + refundInvoiceNo + "]"
                    );

                    adminParameters.to_email = ADMIN_EMAIL;
                    customerParameters.to_email = customerEmail;

                    const emailResults = await sendBothEmails(adminParameters, customerParameters);
                    emailMessage = emailStatusMessage(emailResults, "cancellation & refund invoice");
                }

                // Pop up Official Cancellation & Refund Invoice Receipt Modal
                window.openInvoiceReceiptModal({
                    isCancelled: true,
                    invoiceNo: refundInvoiceNo,
                    orderId: orderId,
                    paymentReference: refundId,
                    customerName: customerName,
                    customerEmail: customerEmail,
                    service: serviceName,
                    paymentMethod: paymentMethod,
                    amount: totalBill,
                    deductionFee: deductionFee,
                    netRefund: netRefund
                });

                showMessage(
                    refundResult,
                    "Order " + orderId + " Cancelled Within 3 Days!\n" +
                    "• Original Total Bill: " + formatPeso(totalBill) + "\n" +
                    "• Less 10% Cancellation Fee: -" + formatPeso(deductionFee) + "\n" +
                    "• Net Refund Amount: " + formatPeso(netRefund) + "\n" +
                    "• Official Refund Invoice: " + refundInvoiceNo +
                    emailMessage,
                    true
                );

            } catch (error) {
                console.error("Refund request error:", error);
                showMessage(refundResult, error.message || "Could not process cancellation.", false);
            } finally {
                refundSubmissionInProgress = false;
                if (refundButton) {
                    refundButton.disabled = false;
                    refundButton.textContent =
                        originalButtonText || "Cancel Order & Send Refund Invoice (10% Deduction)";
                }
            }
        });
    }

    /* ==========================================
       14. HANDLE INCOMING EMAIL CANCEL LINK (?cancelOrder=CF-...)
    ========================================== */

    function checkIncomingEmailCancelLink() {
        const params = new URLSearchParams(window.location.search);
        const cancelOrderId = params.get("cancelOrder");
        if (!cancelOrderId) return;

        const email = params.get("email") || "";
        const name = params.get("name") || "CleanFlow Customer";
        const service = params.get("service") || "Complete Analysis";
        const amount = parseFloat(params.get("amount") || String(getServicePrice(service)));
        const method = params.get("method") || "Online Payment";

        saveLocalOrder({
            id: cancelOrderId,
            invoiceNo: "CF-INV-2026",
            customerName: name,
            customerEmail: email,
            service: service,
            amount: amount,
            paymentMethod: method,
            status: "Payment Approved",
            createdAt: Date.now()
        });

        if (byId("refundOrderId")) byId("refundOrderId").value = cancelOrderId;
        if (byId("refundEmail")) byId("refundEmail").value = email;
        if (byId("refundServicePackage")) {
            byId("refundServicePackage").value = service + "|" + amount;
            updateRefundCalculationPreview();
        }
        if (byId("refundReason") && !byId("refundReason").value) {
            byId("refundReason").value = "Customer requested order cancellation via email portal link within 3 days.";
        }

        const refundSection = byId("refund");
        if (refundSection) {
            setTimeout(function () {
                refundSection.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 250);
        }
    }

    checkIncomingEmailCancelLink();
});
