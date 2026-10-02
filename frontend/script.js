/* =========================================================
   NEEDX — ADVANCED FRONTEND APPLICATION
   ========================================================= */

const API_BASE = "http://127.0.0.1:5000/api";

let currentUser = null;
let currentToken = localStorage.getItem("needx_token");

let currentNeed = "";
let currentAnalysis = null;
let currentProviders = [];
let filteredProviders = [];

let selectedProvider = null;

let userLocation = {
    latitude: null,
    longitude: null,
    address: ""
};


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

    setupTextarea();

    if (currentToken) {
        await loadCurrentUser();
    } else {
        updateAuthUI();
    }

    setMinimumDate();

});


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}


function showElement(element) {
    if (element) {
        element.classList.remove("hidden");
    }
}


function hideElement(element) {
    if (element) {
        element.classList.add("hidden");
    }
}


function escapeHTML(value) {

    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function formatCurrency(value) {

    if (value === null || value === undefined || value === "") {
        return "Price unavailable";
    }

    const number = Number(value);

    if (Number.isNaN(number)) {
        return escapeHTML(value);
    }

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
    }).format(number);
}


function formatDistance(distance) {

    if (distance === null || distance === undefined) {
        return "Distance unavailable";
    }

    const number = Number(distance);

    if (Number.isNaN(number)) {
        return escapeHTML(distance);
    }

    if (number < 1) {
        return `${Math.round(number * 1000)} m`;
    }

    return `${number.toFixed(1)} km`;
}


function formatDate(date) {

    if (!date) {
        return "";
    }

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
        return escapeHTML(date);
    }

    return parsed.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}


function formatTime(date) {

    if (!date) {
        return "";
    }

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
        return "";
    }

    return parsed.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit"
    });
}


/* =========================================================
   API REQUEST HELPER
   ========================================================= */

async function apiRequest(
    endpoint,
    options = {}
) {

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (currentToken) {
        headers.Authorization = `Bearer ${currentToken}`;
    }

    try {

        const response = await fetch(
            `${API_BASE}${endpoint}`,
            {
                ...options,
                headers
            }
        );

        let result = null;

        try {
            result = await response.json();
        } catch {
            result = null;
        }

        if (response.status === 401) {

            currentToken = null;
            currentUser = null;

            localStorage.removeItem("needx_token");

            updateAuthUI();

            throw new Error(
                result?.message ||
                "Your session has expired. Please login again."
            );
        }

        if (!response.ok) {

            throw new Error(
                result?.message ||
                result?.error ||
                `Request failed (${response.status})`
            );
        }

        return result;

    } catch (error) {

        if (
            error.name === "TypeError" &&
            error.message.includes("fetch")
        ) {
            throw new Error(
                "NeedX backend is not reachable. Make sure Flask is running on port 5000."
            );
        }

        throw error;
    }
}


/* =========================================================
   TOAST
   ========================================================= */

let toastTimer = null;

function showToast(
    message,
    type = "success"
) {

    const toast = $("toast");

    if (!toast) {
        return;
    }

    const icon = $("toastIcon");
    const messageElement = $("toastMessage");

    if (messageElement) {
        messageElement.textContent = message;
    }

    if (icon) {

        if (type === "error") {
            icon.textContent = "!";
        } else if (type === "warning") {
            icon.textContent = "!";
        } else {
            icon.textContent = "✓";
        }
    }

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}


/* =========================================================
   LOADING
   ========================================================= */

function showLoading(
    title = "Finding the right help...",
    text = "Please wait..."
) {

    const overlay = $("loadingOverlay");

    if (!overlay) {
        return;
    }

    $("loadingTitle").textContent = title;
    $("loadingText").textContent = text;

    overlay.classList.remove("hidden");
}


function hideLoading() {

    const overlay = $("loadingOverlay");

    if (overlay) {
        overlay.classList.add("hidden");
    }
}


/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

const pages = [
    "homePage",
    "resultsPage",
    "providerPage",
    "dashboardPage",
    "savedPage",
    "notificationsPage"
];


function hideAllPages() {

    pages.forEach(pageId => {

        const page = $(pageId);

        if (page) {
            page.classList.remove("active-page");
        }

    });
}


function setActiveNav(activeId) {

    document
        .querySelectorAll(".nav-link")
        .forEach(button => {
            button.classList.remove("active");
        });

    const active = $(activeId);

    if (active) {
        active.classList.add("active");
    }
}


function showHome() {

    hideAllPages();

    $("homePage")?.classList.add("active-page");

    setActiveNav("navHome");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


function showResults() {

    hideAllPages();

    $("resultsPage")?.classList.add("active-page");

    setActiveNav("");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


function showDashboard() {

    if (!currentToken) {

        openAuthModal();

        showToast(
            "Please login to open your dashboard.",
            "warning"
        );

        return;
    }

    closeProfileMenu();

    hideAllPages();

    $("dashboardPage")?.classList.add("active-page");

    setActiveNav("navDashboard");

    loadDashboard();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


function showSaved() {

    if (!currentToken) {

        openAuthModal();

        showToast(
            "Please login to view saved providers.",
            "warning"
        );

        return;
    }

    closeProfileMenu();

    hideAllPages();

    $("savedPage")?.classList.add("active-page");

    setActiveNav("navSaved");

    loadSavedProviders();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


function showNotifications() {

    if (!currentToken) {

        openAuthModal();

        showToast(
            "Please login to view notifications.",
            "warning"
        );

        return;
    }

    closeProfileMenu();

    hideAllPages();

    $("notificationsPage")?.classList.add("active-page");

    setActiveNav("navNotifications");

    loadNotifications();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* =========================================================
   AUTH UI
   ========================================================= */

function updateAuthUI() {

    const authButton = $("authButton");
    const profileButton = $("profileButton");

    if (currentUser && currentToken) {

        if (authButton) {
            authButton.classList.add("hidden");
        }

        if (profileButton) {
            profileButton.classList.remove("hidden");
        }

        const name =
            currentUser.name ||
            currentUser.full_name ||
            currentUser.username ||
            "User";

        const email =
            currentUser.email ||
            "user@example.com";

        $("menuUserName").textContent = name;
        $("menuUserEmail").textContent = email;

        $("profileInitial").textContent =
            name.charAt(0).toUpperCase();

    } else {

        if (authButton) {
            authButton.classList.remove("hidden");
        }

        if (profileButton) {
            profileButton.classList.add("hidden");
        }

        closeProfileMenu();
    }
}


/* =========================================================
   PROFILE MENU
   ========================================================= */

function toggleProfileMenu() {

    const menu = $("profileMenu");

    if (!menu) {
        return;
    }

    menu.classList.toggle("hidden");
}


function closeProfileMenu() {

    $("profileMenu")?.classList.add("hidden");
}


document.addEventListener("click", event => {

    const menu = $("profileMenu");
    const button = $("profileButton");

    if (!menu || !button) {
        return;
    }

    if (
        !menu.contains(event.target) &&
        !button.contains(event.target)
    ) {
        menu.classList.add("hidden");
    }
});


/* =========================================================
   LOAD CURRENT USER
   ========================================================= */

async function loadCurrentUser() {

    try {

        const result =
            await apiRequest("/auth/me");

        currentUser =
            result?.data ||
            result?.user ||
            null;

        updateAuthUI();

        if (currentUser) {
            await refreshNotificationBadge();
        }

    } catch (error) {

        console.warn(
            "Could not restore session:",
            error.message
        );

        currentToken = null;
        currentUser = null;

        localStorage.removeItem("needx_token");

        updateAuthUI();
    }
}


/* =========================================================
   AUTH MODAL
   ========================================================= */

function openAuthModal() {

    $("authModal")?.classList.remove("hidden");

    showLoginForm();

    setTimeout(() => {
        $("loginEmail")?.focus();
    }, 100);
}


function closeAuthModal() {

    $("authModal")?.classList.add("hidden");

    $("authMessage")?.classList.add("hidden");
}


function showLoginForm() {

    $("loginForm")?.classList.remove("hidden");
    $("registerForm")?.classList.add("hidden");

    $("authTitle").textContent =
        "Welcome to NeedX";

    $("authSubtitle").textContent =
        "Sign in to manage your service requests.";
}


function showRegisterForm() {

    $("loginForm")?.classList.add("hidden");
    $("registerForm")?.classList.remove("hidden");

    $("authTitle").textContent =
        "Create your NeedX account";

    $("authSubtitle").textContent =
        "Join NeedX and connect with real-world services.";
}


/* =========================================================
   REGISTER
   ========================================================= */

async function register(event) {

    event.preventDefault();

    const name =
        $("registerName").value.trim();

    const email =
        $("registerEmail").value.trim();

    const password =
        $("registerPassword").value;

    if (!name || !email || !password) {

        showAuthMessage(
            "Please fill all required fields.",
            "error"
        );

        return;
    }

    try {

        showAuthMessage(
            "Creating your account...",
            "info"
        );

        const result =
            await apiRequest(
                "/auth/register",
                {
                    method: "POST",

                    body: JSON.stringify({
                        name,
                        email,
                        password
                    })
                }
            );

        if (result?.data?.access_token) {

            currentToken =
                result.data.access_token;

            localStorage.setItem(
                "needx_token",
                currentToken
            );

        } else if (result?.access_token) {

            currentToken =
                result.access_token;

            localStorage.setItem(
                "needx_token",
                currentToken
            );
        }

        await loadCurrentUser();

        closeAuthModal();

        showToast(
            "Account created successfully."
        );

        $("registerForm").reset();

    } catch (error) {

        showAuthMessage(
            error.message,
            "error"
        );
    }
}


/* =========================================================
   LOGIN
   ========================================================= */

async function login(event) {

    event.preventDefault();

    const email =
        $("loginEmail").value.trim();

    const password =
        $("loginPassword").value;

    if (!email || !password) {

        showAuthMessage(
            "Enter your email and password.",
            "error"
        );

        return;
    }

    try {

        showAuthMessage(
            "Signing you in...",
            "info"
        );

        const result =
            await apiRequest(
                "/auth/login",
                {
                    method: "POST",

                    body: JSON.stringify({
                        email,
                        password
                    })
                }
            );

        

const token =
    result?.data?.access_token ||
    result?.data?.token ||
    result?.access_token ||
    result?.token;

if (!token) {
    throw new Error(
        "Login succeeded but no access token was received."
    );
}

        currentToken = token;

        localStorage.setItem(
            "needx_token",
            token
        );

        await loadCurrentUser();

        closeAuthModal();

        showToast(
            "Welcome back to NeedX."
        );

        $("loginForm").reset();

    } catch (error) {

        showAuthMessage(
            error.message,
            "error"
        );
    }
}


function showAuthMessage(
    message,
    type = "info"
) {

    const element = $("authMessage");

    if (!element) {
        return;
    }

    element.textContent = message;

    element.classList.remove("hidden");

    if (type === "error") {

        element.style.color = "#fb7185";

    } else if (type === "info") {

        element.style.color = "#38bdf8";

    } else {

        element.style.color = "#34d399";
    }
}


/* =========================================================
   LOGOUT
   ========================================================= */

function logout() {

    currentToken = null;
    currentUser = null;

    localStorage.removeItem(
        "needx_token"
    );

    updateAuthUI();

    closeProfileMenu();

    showHome();

    showToast(
        "You have been logged out."
    );
}


/* =========================================================
   LOCATION
   ========================================================= */

function detectLocation() {

    if (!navigator.geolocation) {

        showToast(
            "Location is not supported by this browser.",
            "error"
        );

        return;
    }

    showLoading(
        "Detecting your location...",
        "Requesting location permission."
    );

    navigator.geolocation.getCurrentPosition(

        async position => {

            userLocation.latitude =
                position.coords.latitude;

            userLocation.longitude =
                position.coords.longitude;

            userLocation.address =
                `${userLocation.latitude.toFixed(5)}, ${userLocation.longitude.toFixed(5)}`;

            updateLocationUI();

            hideLoading();

            showToast(
                "Location detected successfully."
            );

        },

        error => {

            hideLoading();

            let message =
                "Unable to detect your location.";

            if (error.code === 1) {
                message =
                    "Location permission was denied.";
            }

            showToast(
                message,
                "error"
            );
        },

        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );
}


function updateLocationUI() {

    const shortLocation =
        userLocation.address ||
        "Location";

    $("locationText").textContent =
        shortLocation;

    $("searchLocation").textContent =
        shortLocation;
}


/* =========================================================
   SEARCH EXAMPLES
   ========================================================= */

function setupTextarea() {

    const input = $("needInput");

    if (!input) {
        return;
    }

    input.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter" &&
                (event.ctrlKey || event.metaKey)
            ) {

                event.preventDefault();

                analyzeNeed();
            }
        }
    );
}


function useExample(type) {

    const input = $("needInput");

    if (!input) {
        return;
    }

    const examples = {

        phone:
            "My iPhone display is broken and I need it repaired today.",

        laptop:
            "My laptop is very slow and keeps shutting down. I need a technician to check it.",

        home:
            "There is a water leakage in my house and I need a plumber as soon as possible."
    };

    input.value =
        examples[type] ||
        examples.phone;

    input.focus();
}


function useCategory(category) {

    const input = $("needInput");

    if (!input) {
        return;
    }

    input.value =
        `I need help with ${category}. Please find suitable service providers near me.`;

    input.focus();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* =========================================================
   SMART NEED ANALYSIS
   ========================================================= */

async function analyzeNeed() {

    const input =
        $("needInput");

    if (!input) {
        return;
    }

    const need =
        input.value.trim();

    if (need.length < 5) {

        showToast(
            "Please describe what you need.",
            "warning"
        );

        input.focus();

        return;
    }

    currentNeed = need;

    showLoading(
        "Understanding your need...",
        "Analyzing your requirement and finding the right service category."
    );

    try {

        const result =
            await apiRequest(
                "/needs/analyze",
                {
                    method: "POST",

                    body: JSON.stringify({
                        text: need,
                        need
                    })
                }
            );

        currentAnalysis =
            result?.data ||
            result?.analysis ||
            result ||
            {};

        renderAnalysis();

        await findMatchingProviders();

    } catch (error) {

        hideLoading();

        showToast(
            error.message,
            "error"
        );
    }
}


/* =========================================================
   RENDER ANALYSIS
   ========================================================= */

function renderAnalysis() {

    const card =
        $("analysisCard");

    if (!card) {
        return;
    }

    const category =
        currentAnalysis.category ||
        currentAnalysis.service_category ||
        "General Service";

    const problem =
        currentAnalysis.problem ||
        currentAnalysis.issue ||
        currentAnalysis.summary ||
        currentNeed;

    const urgency =
        currentAnalysis.urgency ||
        currentAnalysis.priority ||
        "normal";

    $("analysisCategory").textContent =
        category;

    $("analysisProblem").textContent =
        problem.length > 70
            ? `${problem.substring(0, 70)}...`
            : problem;

    $("analysisUrgency").textContent =
        String(urgency).toUpperCase();

    $("analysisSummary").textContent =
        `Need detected as ${category}.`;

    card.classList.remove("hidden");
}


/* =========================================================
   FIND MATCHING PROVIDERS
   ========================================================= */

async function findMatchingProviders() {

    try {

        showLoading(
            "Finding the right providers...",
            "Comparing distance, pricing, ratings and service compatibility."
        );

        const payload = {

            need: currentNeed,

            text: currentNeed,

            category:
                currentAnalysis?.category ||
                currentAnalysis?.service_category ||
                "",

            problem:
                currentAnalysis?.problem ||
                currentAnalysis?.issue ||
                "",

            latitude:
                userLocation.latitude,

            longitude:
                userLocation.longitude

        };

        let result;

        try {

            result =
                await apiRequest(
                    "/match",
                    {
                        method: "POST",
                        body: JSON.stringify(payload)
                    }
                );

        } catch (matchError) {

            console.warn(
                "Match endpoint failed. Trying provider search.",
                matchError.message
            );

            const params =
                new URLSearchParams();

            if (payload.category) {
                params.set(
                    "category",
                    payload.category
                );
            }

            if (
                payload.latitude !== null &&
                payload.longitude !== null
            ) {
                params.set(
                    "latitude",
                    payload.latitude
                );

                params.set(
                    "longitude",
                    payload.longitude
                );
            }

            result =
                await apiRequest(
                    `/providers?${params.toString()}`
                );
        }

        currentProviders =
            extractProviders(result);

        filteredProviders =
            [...currentProviders];

        renderProviders();

        showResults();

        hideLoading();

        updateResultMeta();

        if (currentProviders.length === 0) {

            showToast(
                "No matching providers were found. Try another description.",
                "warning"
            );

        } else {

            showToast(
                `${currentProviders.length} suitable provider${currentProviders.length === 1 ? "" : "s"} found.`
            );
        }

    } catch (error) {

        hideLoading();

        currentProviders = [];
        filteredProviders = [];

        showResults();

        renderProviders();

        showToast(
            error.message,
            "error"
        );
    }
}


/* =========================================================
   EXTRACT PROVIDERS
   ========================================================= */

function extractProviders(result) {

    if (!result) {
        return [];
    }

    const data =
        result.data ??
        result.providers ??
        result.results ??
        result.matches ??
        result;

    if (Array.isArray(data)) {
        return data;
    }

    if (data && Array.isArray(data.providers)) {
        return data.providers;
    }

    if (data && Array.isArray(data.matches)) {
        return data.matches;
    }

    if (data && Array.isArray(data.results)) {
        return data.results;
    }

    return [];
}


/* =========================================================
   PROVIDER HELPERS
   ========================================================= */

function providerId(provider) {

    return (
        provider.id ??
        provider.provider_id ??
        provider.user_id
    );
}


function providerName(provider) {

    return (
        provider.business_name ||
        provider.name ||
        provider.provider_name ||
        provider.full_name ||
        "Service Provider"
    );
}


function providerCategory(provider) {

    return (
        provider.category ||
        provider.service_category ||
        provider.service ||
        "General Service"
    );
}


function providerRating(provider) {

    const rating =
        provider.rating ??
        provider.average_rating ??
        provider.avg_rating ??
        0;

    const number = Number(rating);

    return Number.isNaN(number)
        ? 0
        : number;
}


function providerPrice(provider) {

    return (
        provider.price ??
        provider.starting_price ??
        provider.min_price ??
        provider.estimated_price ??
        null
    );
}


function providerDistance(provider) {

    return (
        provider.distance ??
        provider.distance_km ??
        provider.distanceKm ??
        null
    );
}


function providerLocation(provider) {

    return (
        provider.address ||
        provider.location ||
        provider.city ||
        provider.service_area ||
        "Location available after contact"
    );
}


function providerDescription(provider) {

    return (
        provider.description ||
        provider.bio ||
        provider.about ||
        "Professional service provider available through NeedX."
    );
}


function providerPhone(provider) {

    return (
        provider.phone ||
        provider.phone_number ||
        provider.mobile ||
        ""
    );
}


function providerEmail(provider) {

    return (
        provider.email ||
        ""
    );
}


function providerEta(provider) {

    return (
        provider.estimated_time ||
        provider.estimated_completion_time ||
        provider.completion_time ||
        provider.eta ||
        "Time depends on service"
    );
}


function providerVerified(provider) {

    return Boolean(
        provider.verified ??
        provider.is_verified ??
        provider.verification_status === "verified"
    );
}


function providerMatchScore(provider) {

    const score =
        provider.match_score ??
        provider.matchScore ??
        provider.score ??
        null;

    if (score === null) {
        return null;
    }

    const number = Number(score);

    if (Number.isNaN(number)) {
        return null;
    }

    return number;
}


/* =========================================================
   PROVIDER ICON
   ========================================================= */

function providerIcon(provider) {

    const category =
        providerCategory(provider).toLowerCase();

    if (
        category.includes("phone") ||
        category.includes("mobile")
    ) {
        return "📱";
    }

    if (
        category.includes("laptop") ||
        category.includes("computer")
    ) {
        return "💻";
    }

    if (
        category.includes("home") ||
        category.includes("plumb") ||
        category.includes("electric")
    ) {
        return "🏠";
    }

    if (
        category.includes("vehicle") ||
        category.includes("car") ||
        category.includes("bike")
    ) {
        return "🚗";
    }

    if (
        category.includes("beauty") ||
        category.includes("salon")
    ) {
        return "💇";
    }

    if (
        category.includes("clean")
    ) {
        return "🧹";
    }

    if (
        category.includes("electronic")
    ) {
        return "🔧";
    }

    return "🛠️";
}


/* =========================================================
   PROVIDER CARD
   ========================================================= */

function createProviderCard(provider) {

    const id =
        providerId(provider);

    const name =
        providerName(provider);

    const category =
        providerCategory(provider);

    const rating =
        providerRating(provider);

    const price =
        providerPrice(provider);

    const distance =
        providerDistance(provider);

    const location =
        providerLocation(provider);

    const eta =
        providerEta(provider);

    const verified =
        providerVerified(provider);

    const score =
        providerMatchScore(provider);

    const saved =
        Boolean(
            provider.is_saved ??
            provider.saved ??
            false
        );

    return `
        <article
            class="provider-card"
            data-provider-id="${escapeHTML(id)}"
        >

            ${
                score !== null
                    ? `
                    <span class="match-score">
                        ${Math.round(score)}% MATCH
                    </span>
                    `
                    : ""
            }

            <div class="provider-card-top">

                <div class="provider-avatar">
                    ${providerIcon(provider)}
                </div>

                <button
                    class="provider-save ${saved ? "saved" : ""}"
                    onclick="toggleSaveProvider(${Number(id)}, this)"
                    title="Save provider"
                >
                    ${saved ? "♥" : "♡"}
                </button>

            </div>


            <h3 class="provider-name">
                ${escapeHTML(name)}
            </h3>


            <div class="provider-category">
                ${escapeHTML(category)}

                ${
                    verified
                        ? `
                        <span class="verified-badge">
                            ✓ Verified
                        </span>
                        `
                        : ""
                }
            </div>


            <div class="provider-location">
                📍 ${escapeHTML(location)}
            </div>


            <div class="provider-meta">

                <span>
                    ⭐ ${rating > 0 ? rating.toFixed(1) : "New"}
                </span>

                <span>
                    📏 ${formatDistance(distance)}
                </span>

                <span>
                    ⏱️ ${escapeHTML(eta)}
                </span>

            </div>


            <p
                style="
                    color:#94a3b8;
                    font-size:11px;
                    margin-bottom:13px;
                "
            >
                ${escapeHTML(providerDescription(provider)).substring(0, 115)}
            </p>


            <div class="provider-price">

                <div>
                    <small>
                        Estimated / starting price
                    </small>

                    <strong>
                        ${formatCurrency(price)}
                    </strong>
                </div>

                ${
                    rating >= 4.5
                        ? `
                        <span
                            style="
                                color:#86efac;
                                font-size:10px;
                                font-weight:700;
                            "
                        >
                            Highly rated
                        </span>
                        `
                        : ""
                }

            </div>


            <div class="provider-actions">

                <button
                    class="view-provider-btn"
                    onclick="openProvider(${Number(id)})"
                >
                    View Details
                </button>

                <button
                    class="book-provider-btn"
                    onclick="openBooking(${Number(id)})"
                >
                    Request Service
                </button>

            </div>

        </article>
    `;
}


/* =========================================================
   RENDER PROVIDERS
   ========================================================= */

function renderProviders() {

    const grid =
        $("providersGrid");

    const empty =
        $("noResults");

    if (!grid) {
        return;
    }

    grid.innerHTML = "";

    if (
        !filteredProviders ||
        filteredProviders.length === 0
    ) {

        showElement(empty);

        updateResultMeta();

        return;
    }

    hideElement(empty);

    filteredProviders.forEach(provider => {

        grid.insertAdjacentHTML(
            "beforeend",
            createProviderCard(provider)
        );

    });

    updateResultMeta();
}


function updateResultMeta() {

    const count =
        filteredProviders.length;

    if ($("resultCount")) {
        $("resultCount").textContent =
            `${count} provider${count === 1 ? "" : "s"}`;
    }

    if ($("searchStatus")) {

        $("searchStatus").textContent =
            count > 0
                ? "Matches ranked using NeedX matching."
                : "No suitable providers found.";
    }

    if ($("resultsTitle")) {

        $("resultsTitle").textContent =
            count > 0
                ? `Found ${count} suitable provider${count === 1 ? "" : "s"}`
                : "No suitable providers found";
    }

    if ($("resultsSubtitle")) {

        $("resultsSubtitle").textContent =
            currentAnalysis?.category
                ? `Results for ${currentAnalysis.category}`
                : "Comparing suitable providers near you.";
    }
}


/* =========================================================
   FILTERS
   ========================================================= */

function toggleFilters() {

    $("filtersPanel")?.classList.toggle(
        "hidden"
    );
}


function applyFilters() {

    const maxDistance =
        Number(
            $("distanceFilter")?.value || 100
        );

    const minRating =
        Number(
            $("ratingFilter")?.value || 0
        );

    const sort =
        $("sortFilter")?.value || "match";

    filteredProviders =
        currentProviders.filter(provider => {

            const distance =
                providerDistance(provider);

            const rating =
                providerRating(provider);

            const distanceValid =
                distance === null ||
                Number(distance) <= maxDistance;

            const ratingValid =
                rating >= minRating;

            return (
                distanceValid &&
                ratingValid
            );
        });


    filteredProviders.sort(
        (a, b) => {

            if (sort === "rating") {
                return (
                    providerRating(b) -
                    providerRating(a)
                );
            }

            if (sort === "distance") {

                const da =
                    Number(providerDistance(a));

                const db =
                    Number(providerDistance(b));

                return (
                    (Number.isNaN(da) ? 99999 : da) -
                    (Number.isNaN(db) ? 99999 : db)
                );
            }

            if (sort === "price") {

                const pa =
                    Number(providerPrice(a));

                const pb =
                    Number(providerPrice(b));

                return (
                    (Number.isNaN(pa) ? 99999999 : pa) -
                    (Number.isNaN(pb) ? 99999999 : pb)
                );
            }

            const sa =
                Number(
                    providerMatchScore(a) ?? 0
                );

            const sb =
                Number(
                    providerMatchScore(b) ?? 0
                );

            return sb - sa;
        }
    );

    renderProviders();

    showToast(
        `Filters applied. ${filteredProviders.length} providers match.`
    );
}


/* =========================================================
   PROVIDER DETAILS
   ========================================================= */

async function openProvider(id) {

    if (!id) {
        return;
    }

    showLoading(
        "Opening provider...",
        "Loading provider information."
    );

    try {

        let provider =
            currentProviders.find(
                item =>
                    Number(providerId(item)) === Number(id)
            );

        try {

            const result =
                await apiRequest(
                    `/providers/${id}`
                );

            provider =
                result?.data ||
                result?.provider ||
                result ||
                provider;

        } catch (detailError) {

            console.warn(
                "Provider detail API failed:",
                detailError.message
            );
        }

        if (!provider) {

            throw new Error(
                "Provider information could not be found."
            );
        }

        selectedProvider = provider;

        renderProviderDetail(provider);

        hideLoading();

        hideAllPages();

        $("providerPage")?.classList.add(
            "active-page"
        );

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    } catch (error) {

        hideLoading();

        showToast(
            error.message,
            "error"
        );
    }
}


/* =========================================================
   RENDER PROVIDER DETAIL
   ========================================================= */

function renderProviderDetail(provider) {

    const container =
        $("providerDetail");

    if (!container) {
        return;
    }

    const id =
        providerId(provider);

    const name =
        providerName(provider);

    const category =
        providerCategory(provider);

    const rating =
        providerRating(provider);

    const price =
        providerPrice(provider);

    const distance =
        providerDistance(provider);

    const location =
        providerLocation(provider);

    const phone =
        providerPhone(provider);

    const email =
        providerEmail(provider);

    const eta =
        providerEta(provider);

    const verified =
        providerVerified(provider);

    const description =
        providerDescription(provider);

    const website =
        provider.website ||
        "";

    const latitude =
        provider.latitude ??
        provider.lat ??
        null;

    const longitude =
        provider.longitude ??
        provider.lng ??
        null;


    container.innerHTML = `

        <div class="provider-detail-header">

            <div class="detail-avatar">
                ${providerIcon(provider)}
            </div>


            <div>

                <div class="eyebrow">
                    SERVICE PROVIDER
                </div>

                <h1>
                    ${escapeHTML(name)}
                </h1>

                <div class="detail-category">
                    ${escapeHTML(category)}
                </div>

                <div class="detail-rating">
                    ⭐ ${
                        rating > 0
                            ? rating.toFixed(1)
                            : "New"
                    }

                    ${
                        verified
                            ? " · ✓ Verified"
                            : ""
                    }
                </div>

            </div>


            <div class="detail-actions">

                <button
                    class="primary-btn"
                    onclick="openBooking(${Number(id)})"
                >
                    Request Service
                </button>

                ${
                    phone
                        ? `
                        <button
                            class="view-provider-btn"
                            style="padding:10px;border-radius:10px;"
                            onclick="callProvider('${escapeHTML(phone)}')"
                        >
                            📞 Call
                        </button>
                        `
                        : ""
                }

            </div>

        </div>


        <div class="detail-content-grid">

            <div class="detail-panel">

                <h2>
                    About this provider
                </h2>

                <p>
                    ${escapeHTML(description)}
                </p>


                <div class="detail-info-list">

                    <div class="detail-info-item">
                        <span>Service category</span>
                        <strong>
                            ${escapeHTML(category)}
                        </strong>
                    </div>

                    <div class="detail-info-item">
                        <span>Rating</span>
                        <strong>
                            ⭐ ${
                                rating > 0
                                    ? rating.toFixed(1)
                                    : "New"
                            }
                        </strong>
                    </div>

                    <div class="detail-info-item">
                        <span>Estimated price</span>
                        <strong>
                            ${formatCurrency(price)}
                        </strong>
                    </div>

                    <div class="detail-info-item">
                        <span>Estimated completion</span>
                        <strong>
                            ${escapeHTML(eta)}
                        </strong>
                    </div>

                    <div class="detail-info-item">
                        <span>Distance</span>
                        <strong>
                            ${formatDistance(distance)}
                        </strong>
                    </div>

                    <div class="detail-info-item">
                        <span>Location</span>
                        <strong>
                            ${escapeHTML(location)}
                        </strong>
                    </div>

                </div>

            </div>


            <div class="detail-panel">

                <h2>
                    Contact & Location
                </h2>


                ${
                    phone
                        ? `
                        <div class="detail-info-item">
                            <span>Phone</span>
                            <strong>
                                ${escapeHTML(phone)}
                            </strong>
                        </div>
                        `
                        : ""
                }


                ${
                    email
                        ? `
                        <div
                            class="detail-info-item"
                            style="margin-top:8px;"
                        >
                            <span>Email</span>
                            <strong>
                                ${escapeHTML(email)}
                            </strong>
                        </div>
                        `
                        : ""
                }


                ${
                    website
                        ? `
                        <button
                            class="view-provider-btn"
                            style="
                                width:100%;
                                padding:10px;
                                margin-top:10px;
                                border-radius:10px;
                            "
                            onclick="openWebsite('${escapeHTML(website)}')"
                        >
                            🌐 Visit Website
                        </button>
                        `
                        : ""
                }


                <button
                    class="primary-btn"
                    style="
                        width:100%;
                        margin-top:10px;
                    "
                    onclick="openDirections(
                        ${latitude ?? "null"},
                        ${longitude ?? "null"},
                        '${escapeHTML(location)}'
                    )"
                >
                    🗺️ Get Directions
                </button>


                <button
                    class="view-provider-btn"
                    style="
                        width:100%;
                        padding:10px;
                        margin-top:8px;
                        border-radius:10px;
                    "
                    onclick="toggleSaveProvider(
                        ${Number(id)}
                    )"
                >
                    ❤️ Save Provider
                </button>

            </div>

        </div>

    `;
}


/* =========================================================
   CALL / WEBSITE / MAP
   ========================================================= */

function callProvider(phone) {

    if (!phone) {

        showToast(
            "Phone number is not available.",
            "warning"
        );

        return;
    }

    window.location.href =
        `tel:${phone}`;
}


function openWebsite(url) {

    if (!url) {
        return;
    }

    let finalUrl = url;

    if (
        !finalUrl.startsWith("http://") &&
        !finalUrl.startsWith("https://")
    ) {
        finalUrl =
            `https://${finalUrl}`;
    }

    window.open(
        finalUrl,
        "_blank",
        "noopener,noreferrer"
    );
}


function openDirections(
    latitude,
    longitude,
    location
) {

    let url;

    if (
        latitude !== null &&
        longitude !== null &&
        latitude !== undefined &&
        longitude !== undefined
    ) {

        url =
            `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

    } else {

        url =
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location || "service provider")}`;
    }

    window.open(
        url,
        "_blank",
        "noopener,noreferrer"
    );
}


/* =========================================================
   SAVED PROVIDERS
   ========================================================= */

async function toggleSaveProvider(
    id,
    button = null
) {

    if (!currentToken) {

        openAuthModal();

        showToast(
            "Login to save providers.",
            "warning"
        );

        return;
    }

    if (!id) {
        return;
    }

    try {

        const result =
            await apiRequest(
                "/saved-providers",
                {
                    method: "POST",

                    body: JSON.stringify({
                        provider_id: Number(id)
                    })
                }
            );

        const saved =
            result?.data?.saved ??
            result?.saved ??
            true;

        if (button) {

            button.classList.toggle(
                "saved",
                Boolean(saved)
            );

            button.textContent =
                saved ? "♥" : "♡";
        }

        showToast(
            saved
                ? "Provider saved."
                : "Provider removed from saved."
        );

    } catch (error) {

        /*
         * Some backend versions may expose
         * save/delete as separate operations.
         * Refresh saved state if available.
         */

        showToast(
            error.message,
            "error"
        );
    }
}


/* =========================================================
   SAVED PROVIDERS PAGE
   ========================================================= */

async function loadSavedProviders() {

    const grid =
        $("savedProvidersGrid");

    const empty =
        $("savedEmpty");

    if (!grid) {
        return;
    }

    grid.innerHTML = `
        <div
            style="
                grid-column:1/-1;
                padding:40px;
                text-align:center;
                color:#94a3b8;
            "
        >
            Loading saved providers...
        </div>
    `;

    try {

        const result =
            await apiRequest(
                "/saved-providers"
            );

        const providers =
            extractProviders(result);

        grid.innerHTML = "";

        if (!providers.length) {

            showElement(empty);

            return;
        }

        hideElement(empty);

        providers.forEach(provider => {

            grid.insertAdjacentHTML(
                "beforeend",
                createProviderCard({
                    ...provider,
                    is_saved: true
                })
            );

        });

    } catch (error) {

        grid.innerHTML = "";

        showElement(empty);

        showToast(
            error.message,
            "error"
        );
    }
}

/* =========================================================
   BOOKING MODAL HELPERS
   ========================================================= */

function setMinimumDate() {

    const dateInput = $("bookingDate");

    if (!dateInput) {
        return;
    }

    const today = new Date();

    const year =
        today.getFullYear();

    const month =
        String(today.getMonth() + 1).padStart(2, "0");

    const day =
        String(today.getDate()).padStart(2, "0");

    dateInput.min =
        `${year}-${month}-${day}`;
}


function closeBookingModal() {

    const modal =
        $("bookingModal");

    if (modal) {
        modal.classList.add("hidden");
    }

    const message =
        $("bookingMessage");

    if (message) {
        message.classList.add("hidden");
        message.textContent = "";
    }
}
/* =========================================================
   BOOKING MODAL
   ========================================================= */

async function openBooking(id) {

    if (!currentToken) {

        openAuthModal();

        showToast(
            "Login to send a service request.",
            "warning"
        );

        return;
    }

    if (!id) {
        showToast(
            "Provider information is unavailable.",
            "error"
        );
        return;
    }

    try {

        showLoading(
            "Preparing your service request...",
            "Loading provider information."
        );

        let provider =
            currentProviders.find(
                item =>
                    Number(providerId(item)) === Number(id)
            );

        /*
         * If provider is not already stored,
         * get the latest provider details from backend.
         */

        if (!provider) {

            const result =
                await apiRequest(
                    `/providers/${id}`
                );

            provider =
                result?.data ||
                result?.provider ||
                result ||
                null;
        }

        if (!provider) {

            throw new Error(
                "Provider information could not be found."
            );
        }

        selectedProvider = provider;

        /*
         * Fill booking form
         */

        if ($("bookingProviderName")) {

            $("bookingProviderName").textContent =
                providerName(provider);
        }

        if ($("bookingDescription")) {

            $("bookingDescription").value =
                currentNeed ||
                `I need ${providerCategory(provider)} service.`;
        }

        if ($("bookingLocation")) {

            $("bookingLocation").value =
                userLocation.address || "";
        }

        hideLoading();

        /*
         * Open booking modal
         */

        $("bookingModal")?.classList.remove(
            "hidden"
        );

        setMinimumDate();

        $("bookingDescription")?.focus();

    } catch (error) {

        hideLoading();

        showToast(
            error.message,
            "error"
        );
    }
}
/* =========================================================
   SUBMIT BOOKING
   ========================================================= */

async function submitBooking(event) {

    event.preventDefault();

    if (!selectedProvider) {

        showBookingMessage(
            "Please select a provider first.",
            "error"
        );

        return;
    }

    const providerIdValue =
        providerId(selectedProvider);

    const description =
        $("bookingDescription")
            .value
            .trim();

    const preferredDate =
        $("bookingDate")
            .value;

    const preferredTime =
        $("bookingTime")
            .value;

    const location =
        $("bookingLocation")
            .value
            .trim();


    if (!description) {

        showBookingMessage(
            "Please describe what you need.",
            "error"
        );

        return;
    }


    try {

        showBookingMessage(
            "Sending your request...",
            "info"
        );


        const result =
            await apiRequest(
                "/bookings",
                {
                    method: "POST",

                    body: JSON.stringify({

                        provider_id:
                            Number(providerIdValue),

                        /* Backend expects "need" */
                        need:
                            description,

                        /* Backend expects one datetime */
                        scheduled_at:
                            preferredDate && preferredTime
                                ? `${preferredDate}T${preferredTime}`
                                : null,

                        /* Backend stores this as customer note */
                        customer_note:
                            location || null
                    })
                }
            );


        closeBookingModal();


        showToast(
            "Service request sent successfully."
        );


        $("bookingDescription").value = "";
        $("bookingDate").value = "";
        $("bookingTime").value = "";
        $("bookingLocation").value = "";


        /*
         * Refresh notification badge
         */

        refreshNotificationBadge();


    } catch (error) {

        showBookingMessage(
            error.message,
            "error"
        );
    }
}


/* =========================================================
   BOOKING MESSAGE
   ========================================================= */

function showBookingMessage(
    message,
    type = "info"
) {

    const element =
        $("bookingMessage");

    if (!element) {
        return;
    }

    element.textContent =
        message;

    element.classList.remove(
        "hidden"
    );

    element.style.color =
        type === "error"
            ? "#fb7185"
            : "#38bdf8";
}

/* =========================================================
   DASHBOARD
   ========================================================= */

async function loadDashboard() {

    if (!currentToken) {
        return;
    }

    try {

        /* -----------------------------------------
           Load dashboard statistics
        ----------------------------------------- */

        const dashboardResult =
            await apiRequest("/dashboard");

        const dashboardData =
            dashboardResult?.data ||
            dashboardResult ||
            {};

        updateDashboardStats(dashboardData);


        /* -----------------------------------------
           Load actual service requests
        ----------------------------------------- */

        const bookingsResult =
            await apiRequest("/bookings");

        const bookings =
            Array.isArray(bookingsResult?.data)
                ? bookingsResult.data
                : bookingsResult?.data?.bookings ||
                  bookingsResult?.bookings ||
                  [];

        renderDashboardBookings(bookings);


    } catch (error) {

        console.error(
            "Dashboard loading error:",
            error
        );

        renderDashboardBookings([]);

        updateDashboardStats({});
    }
}


/* =========================================================
   UPDATE DASHBOARD STATISTICS
   ========================================================= */

function updateDashboardStats(data = {}) {

    /*
     * Backend dashboard response contains:
     * user
     * statistics
     */

    const statistics =
        data?.statistics ||
        data?.stats ||
        data ||
        {};


    const totalRequests =
        statistics.total_requests ??
        statistics.totalRequests ??
        statistics.total_bookings ??
        statistics.totalBookings ??
        0;


    const activeRequests =
        statistics.active_requests ??
        statistics.activeRequests ??
        statistics.active_bookings ??
        statistics.activeBookings ??
        0;


    const savedProviders =
        statistics.saved_providers ??
        statistics.savedProviders ??
        statistics.saved_count ??
        statistics.savedCount ??
        0;


    const notifications =
        statistics.notifications ??
        statistics.notification_count ??
        statistics.notificationCount ??
        0;


    /* Total Requests */

    const totalElement =
        $("totalRequests");

    if (totalElement) {
        totalElement.textContent =
            totalRequests;
    }


    /* Active Requests */

    const activeElement =
        $("activeRequests");

    if (activeElement) {
        activeElement.textContent =
            activeRequests;
    }


    /* Saved Providers */

    const savedElement =
        $("savedProviders");

    if (savedElement) {
        savedElement.textContent =
            savedProviders;
    }


    /* Notifications */

    const notificationElement =
        $("dashboardNotifications");

    if (notificationElement) {
        notificationElement.textContent =
            notifications;
    }
}


/* =========================================================
   RENDER DASHBOARD BOOKINGS
   ========================================================= */

function renderDashboardBookings(bookings = []) {

    const container =
        $("dashboardBookings");

    if (!container) {
        return;
    }


    /* No requests */

    if (
        !Array.isArray(bookings) ||
        bookings.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-state">

                <div class="empty-icon">
                    📋
                </div>

                <h2>
                    No requests yet
                </h2>

                <p>
                    Find a service and send your first request.
                </p>

            </div>
        `;

        return;
    }


    container.innerHTML = "";


    bookings.forEach(booking => {

        const provider =
            booking.provider ||
            {};

        const providerNameValue =
            provider.business_name ||
            provider.name ||
            booking.provider_name ||
            "Service Provider";


        const need =
            booking.need ||
            booking.need_text ||
            booking.description ||
            "Service request";


        const category =
            booking.category ||
            "General Service";


        const status =
            booking.status ||
            "requested";


        const price =
            booking.quoted_price ??
            booking.price ??
            null;


        const scheduledAt =
            booking.scheduled_at ||
            booking.scheduledAt ||
            "";


        const createdAt =
            booking.created_at ||
            booking.createdAt ||
            "";


        let statusClass =
            status.toLowerCase()
                .replace(/\s+/g, "-");


        let statusIcon = "⏳";


        if (status === "accepted") {
            statusIcon = "✅";
        }

        else if (status === "rejected") {
            statusIcon = "❌";
        }

        else if (status === "in_progress") {
            statusIcon = "🔧";
        }

        else if (status === "completed") {
            statusIcon = "🎉";
        }

        else if (status === "cancelled") {
            statusIcon = "🚫";
        }


        container.insertAdjacentHTML(
            "beforeend",
            `
            <div class="dashboard-request-card">

                <div class="dashboard-request-top">

                    <div>

                        <div class="dashboard-request-provider">
                            ${escapeHTML(providerNameValue)}
                        </div>

                        <div class="dashboard-request-category">
                            ${escapeHTML(category)}
                        </div>

                    </div>


                    <span
                        class="dashboard-status ${escapeHTML(statusClass)}"
                    >
                        ${statusIcon}
                        ${escapeHTML(
                            status.replace(/_/g, " ")
                        )}
                    </span>

                </div>


                <p class="dashboard-request-need">
                    ${escapeHTML(need)}
                </p>


                <div class="dashboard-request-details">

                    <span>
                        💰
                        ${formatCurrency(price)}
                    </span>


                    ${
                        scheduledAt
                            ? `
                            <span>
                                📅
                                ${formatDate(scheduledAt)}
                                ${formatTime(scheduledAt)}
                            </span>
                            `
                            : ""
                    }


                    ${
                        createdAt
                            ? `
                            <span>
                                🕒
                                ${formatDate(createdAt)}
                            </span>
                            `
                            : ""
                    }

                </div>

            </div>
            `
        );

    });
}

/* =========================================================
   NOTIFICATIONS
   ========================================================= */

async function loadNotifications() {

    const container =
        $("notificationsList");

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div
            style="
                padding:30px;
                color:#94a3b8;
            "
        >
            Loading notifications...
        </div>
    `;


    try {

        const result =
            await apiRequest(
                "/notifications"
            );

        const notifications =
            Array.isArray(result?.data)
                ? result.data
                : result?.data?.notifications ||
                  result?.notifications ||
                  [];


        renderNotifications(
            notifications
        );


        refreshNotificationBadge();

    } catch (error) {

        container.innerHTML = `
            <div class="empty-state">

                <div class="empty-icon">
                    🔔
                </div>

                <h2>
                    Notifications unavailable
                </h2>

                <p>
                    ${escapeHTML(error.message)}
                </p>

            </div>
        `;
    }
}


function renderNotifications(
    notifications
) {

    const container =
        $("notificationsList");

    if (!container) {
        return;
    }

    if (
        !Array.isArray(notifications) ||
        !notifications.length
    ) {

        container.innerHTML = `
            <div class="empty-state">

                <div class="empty-icon">
                    🔔
                </div>

                <h2>
                    You're all caught up
                </h2>

                <p>
                    New service updates will appear here.
                </p>

            </div>
        `;

        return;
    }


    container.innerHTML = "";


    notifications.forEach(notification => {

        const title =
            notification.title ||
            notification.message ||
            "NeedX Update";

        const message =
            notification.body ||
            notification.description ||
            notification.message ||
            "";

        const created =
            notification.created_at ||
            notification.createdAt ||
            "";


        container.insertAdjacentHTML(
            "beforeend",
            `
            <div class="notification-item">

                <div class="notification-icon">
                    🔔
                </div>

                <div>

                    <strong>
                        ${escapeHTML(title)}
                    </strong>

                    <p>
                        ${escapeHTML(message)}
                    </p>

                    ${
                        created
                            ? `
                            <time>
                                ${formatDate(created)}
                                ${formatTime(created)}
                            </time>
                            `
                            : ""
                    }

                </div>

            </div>
            `
        );

    });
}


/* =========================================================
   NOTIFICATION BADGE
   ========================================================= */

async function refreshNotificationBadge() {

    if (!currentToken) {
        return;
    }

    try {

        const result =
            await apiRequest(
                "/notifications"
            );

        const notifications =
            Array.isArray(result?.data)
                ? result.data
                : result?.data?.notifications ||
                  result?.notifications ||
                  [];


        const unread =
            notifications.filter(
                notification =>
                    !notification.is_read &&
                    !notification.read
            ).length;


        const badge =
            $("notificationBadge");

        if (!badge) {
            return;
        }


        if (unread > 0) {

            badge.textContent =
                unread > 99
                    ? "99+"
                    : unread;

            badge.classList.remove(
                "hidden"
            );

        } else {

            badge.classList.add(
                "hidden"
            );
        }


    } catch {
        /*
         * Notification badge is non-critical.
         */
    }
}


/* =========================================================
   PROVIDER REGISTRATION INFO
   ========================================================= */

function showProviderRegistrationInfo() {

    showToast(
        "Provider registration is available through the NeedX provider system.",
        "info"
    );

    if (!currentToken) {
        openAuthModal();
    }
}


/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (event.key === "Escape") {

            closeAuthModal();

            closeBookingModal();

            closeProfileMenu();

            $("filtersPanel")
                ?.classList.add("hidden");
        }

    }
);


/* =========================================================
   MODAL OUTSIDE CLICK
   ========================================================= */

document.addEventListener(
    "click",
    event => {

        const authModal =
            $("authModal");

        const bookingModal =
            $("bookingModal");

        if (
            authModal &&
            event.target === authModal
        ) {
            closeAuthModal();
        }

        if (
            bookingModal &&
            event.target === bookingModal
        ) {
            closeBookingModal();
        }

    }
);


/* =========================================================
   HOME PAGE INITIAL STATE
   ========================================================= */

showHome();

console.log(
    "%cNeedX Frontend Loaded",
    "color:#38bdf8;font-size:16px;font-weight:bold;"
);

console.log(
    "API:",
    API_BASE
);