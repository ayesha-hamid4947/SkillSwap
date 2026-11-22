(() => {
    const accountsKey = "skillswap_accounts";
    const sessionKey = "skillswap_auth_session";
    const accountList = (() => {
        try {
            const stored = JSON.parse(localStorage.getItem(accountsKey) || "[]");
            return Array.isArray(stored) ? stored : [];
        } catch (error) {
            console.error("Could not read SkillSwap accounts from local storage.", error);
            return [];
        }
    })();

    let account = null;
    try {
        const session = JSON.parse(localStorage.getItem(sessionKey) || "null");
        account = session && accountList.find(item => item.id === session.userId) || null;
    } catch (error) {
        console.error("Could not read the SkillSwap login session.", error);
    }

    if (account && account.profile) {
        window.SKILLSWAP_USER = {
            id: account.id,
            email: account.email,
            fullName: account.fullName,
            profile: account.profile
        };
    }

    try {
        const storedPreferences = localStorage.getItem("skillswap_preferences");
        if (storedPreferences) {
            const preferences = JSON.parse(storedPreferences);
            if (preferences && typeof preferences.darkMode === "boolean" &&
                typeof preferences.reduceMotion === "boolean") {
                document.body.classList.toggle("theme-dark", preferences.darkMode);
                document.body.classList.toggle("reduced-motion", preferences.reduceMotion);
            }
        }
    } catch (error) {
        console.error("Could not apply SkillSwap preferences before rendering navigation.", error);
    }

    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    const authenticatedPages = new Set(["dashboard.html", "profile.html", "reviews.html", "settings.html"]);
    const authPage = currentPage === "login.html" || currentPage === "signup.html";
    if (authenticatedPages.has(currentPage) && !window.SKILLSWAP_USER) {
        window.location.replace("login.html");
        return;
    }
    if (window.SKILLSWAP_USER && !window.SKILLSWAP_USER.profile.profileComplete &&
        currentPage !== "profile.html") {
        window.location.replace("profile.html?setup=1");
        return;
    }
    if (authPage && window.SKILLSWAP_USER) {
        const destination = window.SKILLSWAP_USER.profile.profileComplete ? "profile.html" : "profile.html?setup=1";
        window.location.replace(destination);
        return;
    }

    const links = window.SKILLSWAP_USER
        ? [
            ["Profile", "profile.html"],
            ["Dashboard", "dashboard.html"],
            ["Explore Skills", "explore.html"],
            ["Reviews", "reviews.html"],
            ["Settings", "settings.html"],
            ["Sign Out", null]
        ]
        : [
            ["Home", "index.html"],
            ["About Us", "about.html"],
            ["Contact", "contact.html"],
            ["Login / Sign Up", "login.html"]
        ];

    document.querySelectorAll(".primary-navigation .nav-menu-links").forEach(list => {
        list.replaceChildren(...links.map(([label, href]) => {
            const item = document.createElement("li");
            if (href) {
                const link = document.createElement("a");
                link.className = "nav-link";
                link.href = href;
                link.textContent = label;
                if (href === currentPage) {
                    link.classList.add("active");
                    link.setAttribute("aria-current", "page");
                }
                item.appendChild(link);
            } else {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "auth-nav-logout nav-link";
                button.dataset.signOut = "";
                button.textContent = label;
                item.appendChild(button);
            }
            return item;
        }));
    });
})();

// ==========================================
// 1. DASHBOARD LOGIC
// ==========================================
const defaultData = {
    teachSkills: ["HTML & CSS", "JavaScript", "Bootstrap"],
    learnSkills: ["Graphic Design", "UI/UX", "Python"],
    requests: [
        { id: 1, name: "Ali Mansoor", offer: "Graphic Design", request: "HTML & CSS", match: "95%", status: "Accepted" },
        { id: 2, name: "Zainab Khan", offer: "Python", request: "JavaScript", match: "88%", status: "Pending" }
    ],
    recommendedMatches: [
        { id: 101, name: "Ali Mansoor", teaches: "Graphic Design", wants: "HTML & CSS", score: "95% Match" },
        { id: 102, name: "Bilal Ahmad", teaches: "UI/UX Design", wants: "JavaScript", score: "90% Match" }
    ]
};

const accountsStorageKey = "skillswap_accounts";
const authSessionStorageKey = "skillswap_auth_session";
const passwordHashIterations = 210000;

function getDemoSession() {
    const user = window.SKILLSWAP_USER;
    return user ? { name: user.fullName, email: user.email } : null;
}

function readAccounts() {
    const accounts = JSON.parse(localStorage.getItem(accountsStorageKey) || "[]");
    if (!Array.isArray(accounts)) throw new Error("Saved account data is invalid.");
    return accounts;
}

function bytesToHex(bytes) {
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
    if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
        throw new Error("Saved password data is invalid.");
    }
    return new Uint8Array(hex.match(/.{2}/g).map(pair => parseInt(pair, 16)));
}

async function hashPassword(password, salt) {
    if (!window.crypto || !window.crypto.subtle) {
        throw new Error("Password hashing is unavailable in this browser context. Open this site using VS Code Live Server or localhost.");
    }
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    return crypto.subtle.deriveBits({
        name: "PBKDF2",
        salt,
        iterations: passwordHashIterations,
        hash: "SHA-256"
    }, key, 256);
}

async function createLocalAccount(fullName, email, password) {
    const accounts = readAccounts();
    const normalizedEmail = email.trim().toLowerCase();
    if (accounts.some(account => account.email.toLowerCase() === normalizedEmail)) {
        throw new Error("An account with this email address already exists.");
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const passwordHash = bytesToHex(await hashPassword(password, salt));
    const account = {
        id: bytesToHex(crypto.getRandomValues(new Uint8Array(16))),
        fullName: fullName.trim(),
        email: normalizedEmail,
        passwordSalt: bytesToHex(salt),
        passwordHash,
        profile: {
            role: "",
            location: "",
            bio: "",
            teachSkills: [],
            learnSkills: [],
            experienceLevel: "",
            profilePictureUrl: null,
            profileComplete: false
        }
    };
    localStorage.setItem(accountsStorageKey, JSON.stringify([...accounts, account]));
    localStorage.setItem(authSessionStorageKey, JSON.stringify({ userId: account.id }));
    return account;
}

async function authenticateLocalAccount(email, password) {
    const normalizedEmail = email.trim().toLowerCase();
    const account = readAccounts().find(item => item.email.toLowerCase() === normalizedEmail);
    if (!account) throw new Error("Email or password is incorrect.");
    const actualHash = await hashPassword(password, hexToBytes(account.passwordSalt));
    const expectedHash = hexToBytes(account.passwordHash);
    const actualBytes = new Uint8Array(actualHash);
    if (actualBytes.length !== expectedHash.length) throw new Error("Email or password is incorrect.");
    let difference = 0;
    for (let index = 0; index < actualBytes.length; index += 1) {
        difference |= actualBytes[index] ^ expectedHash[index];
    }
    if (difference !== 0) throw new Error("Email or password is incorrect.");
    localStorage.setItem(authSessionStorageKey, JSON.stringify({ userId: account.id }));
    return account;
}

function showAuthError(status, message) {
    status.textContent = message;
    status.classList.add("is-error");
}

function rewriteSkillSwapFooter(session) {
    document.querySelectorAll(".site-footer").forEach(footer => {
        const usefulLinks = [["Reviews", "reviews.html"]];
        if (session) {
            usefulLinks.push(["Dashboard", "dashboard.html"], ["Settings", "settings.html"]);
        }

        const footerMain = footer.querySelector(".footer-main");
        if (footerMain) {
            footerMain.innerHTML = `
                <div class="footer-brand-column">
                    <a class="brand-logo app-brand-link footer-brand" href="index.html" aria-label="SkillSwap home">
                        <span class="brand-mark"><i class="fa-solid fa-shuffle" aria-hidden="true"></i></span>
                        <span class="brand-wordmark"><span class="wordmark-skill">skill</span><span class="wordmark-swap">swap</span></span>
                    </a>
                    <p>Share what you know, learn what you need, and grow through peer-to-peer skill exchanges.</p>
                </div>
                <nav class="footer-link-column" aria-label="Quick links">
                    <h2>Quick Links</h2>
                    <a href="index.html">Home</a>
                    <a href="about.html">About Us</a>
                    <a href="explore.html">Explore Skills</a>
                    <a href="contact.html">Contact</a>
                </nav>
                <nav class="footer-link-column" aria-label="Useful links">
                    <h2>Useful Links</h2>
                    ${usefulLinks.map(([label, href]) => `<a href="${href}">${label}</a>`).join("")}
                </nav>`;
        }

        const footerBottom = footer.querySelector(".footer-bottom");
        if (footerBottom) {
            footerBottom.innerHTML = `
                <span>&copy; 2026 SkillSwap</span>
                <a href="#mainContent" aria-label="Back to top">Back to top <i class="fa-solid fa-arrow-up" aria-hidden="true"></i></a>`;
        }
    });
}

function initializeDemoAuthentication() {
    rewriteSkillSwapFooter(Boolean(window.SKILLSWAP_USER));

    document.addEventListener("click", event => {
        if (!(event.target instanceof Element)) return;
        if (event.target.closest("[data-sign-out]")) showSignOutConfirmation();
    });

    document.querySelectorAll("[data-auth-mode]").forEach(button => {
        button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
    });

    setAuthMode(new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "login");

    document.querySelectorAll("[data-toggle-password]").forEach(button => {
        button.addEventListener("click", () => {
            const input = document.getElementById(button.dataset.togglePassword);
            if (!input) return;
            const isVisible = input.type === "text";
            input.type = isVisible ? "password" : "text";
            button.textContent = isVisible ? "Show" : "Hide";
            button.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
        });
    });

    const loginForm = document.getElementById("demoLoginForm");
    if (loginForm) {
        const status = document.getElementById("loginStatus");
        loginForm.addEventListener("submit", event => {
            event.preventDefault();
            const email = document.getElementById("loginEmail");
            const password = document.getElementById("loginPassword");
            status.textContent = "";
            status.className = "demo-auth-status";

            if (!email.value.trim() || !email.validity.valid) {
                status.textContent = "Enter a valid email address.";
                status.classList.add("is-error");
                email.focus();
                return;
            }
            if (password.value.length < 8) {
                status.textContent = "Use at least 8 characters for the demo password.";
                status.classList.add("is-error");
                password.focus();
                return;
            }

            const submit = loginForm.querySelector('[type="submit"]');
            submit.disabled = true;
            status.textContent = "Signing in...";
            hashAndLogin(email.value.trim(), password.value, status, submit);
        });
    }

    const signupForm = document.getElementById("demoSignupForm");
    if (signupForm) {
        const status = document.getElementById("signupStatus");
        signupForm.addEventListener("submit", event => {
            event.preventDefault();
            const name = document.getElementById("signupName");
            const email = document.getElementById("signupEmail");
            const password = document.getElementById("signupPassword");
            const confirmation = document.getElementById("signupConfirmPassword");
            status.textContent = "";
            status.className = "demo-auth-status";

            if (!name.value.trim()) {
                status.textContent = "Enter your name to continue.";
                status.classList.add("is-error");
                name.focus();
                return;
            }
            if (!email.value.trim() || !email.validity.valid) {
                status.textContent = "Enter a valid email address.";
                status.classList.add("is-error");
                email.focus();
                return;
            }
            if (password.value.length < 8) {
                status.textContent = "Use at least 8 characters for your password.";
                status.classList.add("is-error");
                password.focus();
                return;
            }
            if (password.value !== confirmation.value) {
                status.textContent = "Your passwords do not match.";
                status.classList.add("is-error");
                confirmation.focus();
                return;
            }

            const submit = signupForm.querySelector('[type="submit"]');
            submit.disabled = true;
            status.textContent = "Creating your account...";
            hashAndRegister(name.value.trim(), email.value.trim(), password.value, status, submit);
        });
    }
}

function setAuthMode(mode) {
    const isSignup = mode === "signup";
    const loginForm = document.getElementById("demoLoginForm");
    const signupForm = document.getElementById("demoSignupForm");
    const title = document.getElementById("loginTitle");
    if (!loginForm || !signupForm || !title) return;

    loginForm.hidden = isSignup;
    signupForm.hidden = !isSignup;
    title.textContent = isSignup ? "Create Account" : "Login";
    document.getElementById("authDescription").textContent = isSignup
        ? "Create your account to start sharing and learning skills."
        : "Sign in to continue learning and sharing skills.";
    document.getElementById("loginSwitch").hidden = isSignup;
    document.getElementById("signupSwitch").hidden = !isSignup;
    document.querySelectorAll("[data-auth-mode]").forEach(button => {
        const selected = button.dataset.authMode === mode;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
    });
}

async function hashAndLogin(email, password, status, submit) {
    try {
        const account = await authenticateLocalAccount(email, password);
        window.location.assign(account.profile.profileComplete ? "profile.html" : "profile.html?setup=1");
    } catch (error) {
        showAuthError(status, error.message);
    } finally {
        submit.disabled = false;
    }
}

async function hashAndRegister(fullName, email, password, status, submit) {
    try {
        await createLocalAccount(fullName, email, password);
        window.location.assign("profile.html?setup=1");
    } catch (error) {
        showAuthError(status, error.message);
    } finally {
        submit.disabled = false;
    }
}

function showSignOutConfirmation() {
    let dialog = document.getElementById("signOutConfirmation");
    if (!dialog) {
        dialog = document.createElement("dialog");
        dialog.id = "signOutConfirmation";
        dialog.className = "sign-out-dialog";
        dialog.setAttribute("aria-labelledby", "signOutTitle");
        dialog.innerHTML = `
            <h2 id="signOutTitle">Confirm Sign Out</h2>
            <p>Are you sure you want to sign out of your SkillSwap account?</p>
            <p class="sign-out-error" role="alert" aria-live="polite"></p>
            <div class="sign-out-actions">
                <button type="button" class="sign-out-cancel">Cancel</button>
                <button type="button" class="sign-out-confirm">Yes, Sign Out</button>
            </div>`;
        document.body.appendChild(dialog);
        dialog.querySelector(".sign-out-cancel").addEventListener("click", () => dialog.close());
        dialog.querySelector(".sign-out-confirm").addEventListener("click", () => logoutDemoUser(dialog));
    }

    dialog.querySelector(".sign-out-error").textContent = "";
    dialog.showModal();
}

function logoutDemoUser(dialog) {
    const confirmButton = dialog.querySelector(".sign-out-confirm");
    const status = dialog.querySelector(".sign-out-error");
    confirmButton.disabled = true;
    try {
        localStorage.removeItem(authSessionStorageKey);
        window.location.assign("index.html");
    } catch (error) {
        status.textContent = `Could not sign out: ${error.message}`;
        console.error("Could not clear the SkillSwap session.", error);
        confirmButton.disabled = false;
    }
}

document.addEventListener("DOMContentLoaded", initializeDemoAuthentication);

function getDashboardData() {
    const user = window.SKILLSWAP_USER;
    if (!user) return { ...defaultData };

    const storageKey = `skillswap_dashboard_${user.id}`;
    const saved = localStorage.getItem(storageKey);
    const activity = saved ? JSON.parse(saved) : {};
    return {
        ...defaultData,
        ...activity,
        profile: { name: user.fullName, role: user.profile.role },
        teachSkills: [...user.profile.teachSkills],
        learnSkills: [...user.profile.learnSkills]
    };
}

function saveData(data) {
    const user = window.SKILLSWAP_USER;
    if (!user) return;
    localStorage.setItem(`skillswap_dashboard_${user.id}`, JSON.stringify({
        requests: data.requests,
        recommendedMatches: data.recommendedMatches
    }));
    renderDashboard();
}

function saveAuthenticatedProfile(profile) {
    const user = window.SKILLSWAP_USER;
    if (!user) throw new Error("Please log in to save your profile.");
    const accounts = readAccounts();
    const accountIndex = accounts.findIndex(account => account.id === user.id);
    if (accountIndex < 0) throw new Error("Your saved account could not be found. Please log in again.");

    const fullName = String(profile.fullName || "").trim();
    const role = String(profile.role || "").trim();
    const bio = String(profile.bio || "").trim();
    const location = String(profile.location || "").trim();
    const experienceLevel = profile.experienceLevel;
    const normalizeSkills = skills => {
        if (!Array.isArray(skills)) throw new Error("Enter skills as a comma-separated list.");
        const seen = new Set();
        const unique = skills.map(skill => String(skill).trim()).filter(skill => {
            const normalized = skill.toLocaleLowerCase();
            if (!skill || seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        });
        if (unique.length > 40 || unique.some(skill => skill.length > 80)) {
            throw new Error("Each skills list can contain up to 40 items, with no item over 80 characters.");
        }
        return unique;
    };
    const teachSkills = normalizeSkills(profile.teachSkills);
    const learnSkills = normalizeSkills(profile.learnSkills);
    if (!fullName || fullName.length > 80) throw new Error("Enter your full name (up to 80 characters).");
    if (!role || role.length > 100) throw new Error("Enter your role or study area (up to 100 characters).");
    if (location.length > 100) throw new Error("Location must be 100 characters or fewer.");
    if (!bio || bio.length > 500) throw new Error("Enter a short bio of up to 500 characters.");
    if (!["Beginner", "Intermediate", "Advanced"].includes(experienceLevel)) {
        throw new Error("Choose an experience level.");
    }
    if (!teachSkills.length || !learnSkills.length) {
        throw new Error("Add at least one teaching skill and one skill you want to learn.");
    }

    const previousProfile = accounts[accountIndex].profile;
    let profilePictureUrl = previousProfile.profilePictureUrl || null;
    if (profile.removeProfilePicture) {
        profilePictureUrl = null;
    } else if (profile.profilePicture) {
        if (typeof profile.profilePicture !== "string" ||
            !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(profile.profilePicture) ||
            profile.profilePicture.length > 2_800_000) {
            throw new Error("Choose a valid PNG, JPEG, or WebP image smaller than 2 MB.");
        }
        profilePictureUrl = profile.profilePicture;
    }

    const updatedAccount = {
        ...accounts[accountIndex],
        fullName,
        profile: {
            role,
            location,
            bio,
            teachSkills,
            learnSkills,
            experienceLevel,
            profilePictureUrl,
            profileComplete: true
        }
    };
    accounts[accountIndex] = updatedAccount;
    localStorage.setItem(accountsStorageKey, JSON.stringify(accounts));
    window.SKILLSWAP_USER = {
        id: updatedAccount.id,
        email: updatedAccount.email,
        fullName: updatedAccount.fullName,
        profile: updatedAccount.profile
    };
    return window.SKILLSWAP_USER;
}

function renderDashboard() {
    const teachList = document.getElementById("teachSkillsList");
    if (!teachList) return;

    const data = getDashboardData();

    const savedProfile = data.profile || {};
    const demoSession = getDemoSession();
    const displayName = typeof savedProfile.name === "string"
        ? savedProfile.name
        : (demoSession ? demoSession.name : "SkillSwap member");
    const firstName = displayName.trim().split(/\s+/)[0] || "there";
    const welcomeName = document.getElementById("welcomeName");
    const profileName = document.getElementById("profileName");
    const profileRole = document.getElementById("profileRole");
    const avatarText = document.getElementById("avatarText");
    if (welcomeName) welcomeName.textContent = firstName;
    if (profileName) profileName.textContent = firstName;
    if (profileRole) profileRole.textContent = typeof savedProfile.role === "string" ? savedProfile.role : "SE Student";
    if (avatarText) avatarText.textContent = displayName.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase();

    document.getElementById("countTeaching").innerText = data.teachSkills.length;
    document.getElementById("countLearning").innerText = data.learnSkills.length;
    document.getElementById("countConnections").innerText = data.requests.filter(r => r.status === "Accepted").length;

    const learnList = document.getElementById("learnSkillsList");
    renderSkillTags(teachList, data.teachSkills, "teach");
    renderSkillTags(learnList, data.learnSkills, "learn");

    // Dynamic Recommended Matches showing both Can Teach and Wants to Learn
    const matchesBox = document.getElementById("matchesContainer");
    if (matchesBox) {
        const availablePool = typeof exploreUsers !== 'undefined' ? exploreUsers : [
            { name: "Ali Mansoor", teaches: ["Graphic Design"], wants: ["Python Basics"] },
            { name: "Zainab Khan", teaches: ["Python", "Data Structures"], wants: ["JavaScript"] },
            { name: "Bilal Ahmad", teaches: ["UI/UX Design"], wants: ["JavaScript"] }
        ];

        const matchedList = availablePool.filter(user => {
            const teachingSkills = Array.isArray(user.teaches) ? user.teaches : [user.teaches];
            return teachingSkills.some(teach => 
                data.learnSkills.some(learn => 
                    teach.toLowerCase().includes(learn.toLowerCase()) || 
                    learn.toLowerCase().includes(teach.toLowerCase())
                )
            );
        });

        const displayMatches = matchedList.length > 0 ? matchedList.slice(0, 2) : data.recommendedMatches;

        matchesBox.innerHTML = displayMatches.map(match => {
            const mName = match.name;
            const mTeach = Array.isArray(match.teaches) ? match.teaches.join(', ') : match.teaches;
            const mWants = Array.isArray(match.wants) ? match.wants.join(', ') : (match.wants || "Web Development");
            const mScore = match.score || "94% Match";
            
            return `
                <div class="match-card">
                    <div class="match-card-head">
                        <h4>${mName}</h4>
                        <span class="score-badge">${mScore}</span>
                    </div>
                    <div class="match-details">
                        <p><strong>Can Teach:</strong> ${mTeach}</p>
                        <p class="match-learning"><strong>Wants to Learn:</strong> ${mWants}</p>
                    </div>
                    <button class="btn-primary match-request-button" onclick="sendSwapRequest('${mName}', '${mTeach}')">Request Swap</button>
                </div>
            `;
        }).join('');
    }

    // Dashboard Requests Table 
    const tableBody = document.getElementById("requestsTableBody");
    tableBody.innerHTML = data.requests.map(req => `
        <tr>
            <td><strong>${req.name}</strong></td>
            <td>${req.offer}</td>
            <td>${req.request}</td>
            <td><strong>${req.match}</strong></td>
            <td><span class="status-badge status-${req.status.toLowerCase()}">${req.status}</span></td>
            <td>
    ${req.status === 'Accepted' 
        ? `<button class="btn-primary chat-open-btn" data-name="${req.name}" data-skill="${req.offer}"><i class="fa-solid fa-comments"></i> Chat</button>`
        : `<button class="btn-secondary btn-cancel-request" onclick="cancelSwapRequest(${req.id})"><i class="fa-solid fa-trash-can"></i> Cancel</button>`
    }
</td>
        </tr>
    `).join('');

    // Attach event listeners safely to all Chat buttons
    document.querySelectorAll('.chat-open-btn').forEach(button => {
        button.addEventListener('click', function() {
            const partnerName = this.getAttribute('data-name');
            const skillOffered = this.getAttribute('data-skill');
            openPartnerChat(partnerName, skillOffered);
        });
    });

    const closeChatButton = document.querySelector(".partner-chat-close");
    const partnerChatForm = document.querySelector(".partner-chat-form");
    if (closeChatButton) closeChatButton.onclick = closePartnerChatModal;
    if (partnerChatForm) partnerChatForm.onsubmit = sendPartnerModalMessage;

    function openPartnerChat(partnerName, skillOffered) {
    document.getElementById("modalPartnerName").innerText = partnerName;
    document.getElementById("modalPartnerInitial").innerText = partnerName.split(' ').map(n => n[0]).join(''); //Ali Mansoor -> AM
    
    const modal = document.getElementById("partnerChatModal"); //Chat modal ko select karta hai.
    if (modal) {
        modal.classList.add("is-open"); //Modal mein is-open CSS class add karta hai, jis se modal visible hota hai.
        modal.setAttribute("aria-hidden", "false"); //Accessibility ke liye batata hai ke modal hidden nahi hai.
    }
}

function closePartnerChatModal() { //Ye chat modal close karta hai.
    const modal = document.getElementById("partnerChatModal");
    if (modal) {
        modal.classList.remove("is-open"); //is-open class remove karta hai, jis se modal close ho jata hai.
        modal.setAttribute("aria-hidden", "true");//Accessibility ke liye batata hai ke modal hidden hai.
    }
}

function sendPartnerModalMessage(event) { //form submit hone ka event object.
    
    // preventDefault:browser ka default form submission rokta hai.
//Iska faida ye hai ke form submit hone par page automatically reload nahi hota.
    
    event.preventDefault();
    const input = document.getElementById("modalChatInput");
    const msg = input.value.trim(); //user input ko trim(shuru r akhir ki space remove) karke msg variable mein store karta hai.
    if (!msg) return; //agr msg empty hai to function yhi ruk jata hai, aur aage ka code execute nahi hota.

    const chatBody = document.getElementById("modalChatMessages");
    const sentMessage = document.createElement("div"); //naya div element create karta hai jisme sent message show hoga.
    
    sentMessage.className = "partner-chat-message sent"; //div ko CSS class assign karrha h
    sentMessage.textContent = msg; //div ke andar user ka message add karta hai.
    
    chatBody.appendChild(sentMessage); //div ko chat body mein append karta hai, jisse message chat window mein show hota hai.
    input.value = ""; //input field ko clear karta hai, jisse user dobara message type kar sake.
    chatBody.scrollTop = chatBody.scrollHeight; //chat body ko scroll karta hai, jisse latest message visible ho.

    setTimeout(() => { //1 second ke baad partner ka reply show karta hai.

        //Ye aik reply message create karta hai aur usay chat mein show karta hai.
        const reply = document.createElement("div");
        reply.className = "partner-chat-message received";
        reply.textContent = "Got it! Let's schedule our session soon.";
        chatBody.appendChild(reply);
        chatBody.scrollTop = chatBody.scrollHeight;
    }, 1000); //1000 milliseconds yani 1 second baad reply show hoga.
}
}

function renderSkillTags(list, skills, type) {
    list.replaceChildren(...skills.map((skill, index) => {
        const item = document.createElement("li");
        item.className = "tag-item";
        item.appendChild(document.createTextNode(skill));

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "remove-skill-button";
        removeButton.setAttribute("aria-label", `Remove ${skill}`);
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-circle-xmark";
        icon.setAttribute("aria-hidden", "true");
        removeButton.appendChild(icon);
        removeButton.addEventListener("click", () => removeSkill(type, index));
        item.appendChild(removeButton);
        return item;
    }));
}

function toggleSkillForm() { //Ye function skill add karne ka form show/hide karta hai.
    const form = document.getElementById("addSkillForm");
    if (form) form.classList.toggle("hidden"); //hidden class toggle karta hai, jisse form show ya hide hota hai.
}

async function handleAddSkill(event) {
    event.preventDefault(); //Form submit hone ka default behavior rokta hai, jisse page reload nahi hota.
    const type = document.getElementById("skillType").value; //Ye value check karta hai ke user "teach" ya "learn" skill add kar raha hai.
    const name = document.getElementById("skillName").value.trim(); //skill ka naam leta hai.
    if (!name) return;

    const data = getDashboardData();
    if (type === "teach") data.teachSkills.push(name); //agr type teach hai to teachSkills array mein skill add karta hai.
    else data.learnSkills.push(name);

    try {
        await saveAuthenticatedProfile({
            ...window.SKILLSWAP_USER.profile,
            fullName: window.SKILLSWAP_USER.fullName,
            [type === "teach" ? "teachSkills" : "learnSkills"]: type === "teach" ? data.teachSkills : data.learnSkills
        });
        renderDashboard();
        showToast("Skill saved to your profile.");
    } catch (error) {
        showToast(error.message);
        return;
    }
    document.getElementById("skillName").value = ""; //Input field ko clear karta hai.
    toggleSkillForm(); //Form ko hide karta hai.
}

async function removeSkill(type, index) {
    const data = getDashboardData();
    if (type === "teach") data.teachSkills.splice(index, 1);
    else data.learnSkills.splice(index, 1);
    try {
        await saveAuthenticatedProfile({
            ...window.SKILLSWAP_USER.profile,
            fullName: window.SKILLSWAP_USER.fullName,
            [type === "teach" ? "teachSkills" : "learnSkills"]: type === "teach" ? data.teachSkills : data.learnSkills
        });
        renderDashboard();
        showToast("Skill removed from your profile.");
    } catch (error) {
        showToast(error.message);
    }
}

function cancelSwapRequest(requestId) {
    let dashboardData = getDashboardData();
    
    // Request ko ID ke zariye filter out (remove) kar dein
    dashboardData.requests = dashboardData.requests.filter(req => req.id !== requestId); //ka matlab: jis request ki ID cancel karni hai, usay remove kar do.
    
    // Updated data save karein
    saveData(dashboardData);
    
    showToast("Pending swap request has been cancelled."); //User ko notification show karta hai.
}

function sendSwapRequest(partnerName, skillOffered) {
    const dashboardData = getDashboardData();

    // Check karein ke request pehle se mojood to nahi
    const alreadyExists = dashboardData.requests.some(req => req.name === partnerName);
    if (alreadyExists) {
        showToast(`You already have an active request with ${partnerName}!`);
        return;
    }

    // Nayi request push karein
    dashboardData.requests.push({
        id: Date.now(),
        name: partnerName,
        offer: skillOffered || "General Skill",
        request: "JavaScript",
        match: "94%",
        status: "Pending"
    });

    saveData(dashboardData);

    showToast(`Swap request successfully sent to ${partnerName}! Check your Dashboard for status.`);
}
// ==========================================
// 2. ADVANCED EXPLORE SKILLS LOGIC
// ==========================================
const exploreUsers = [
    {
        id: 1,
        name: "Maryam Niaz",
        role: "Computer Science Student",
        initials: "MN",
        category: "Programming",
        level: "Intermediate",
        verified: true,
        online: true,
        bio: "Passionate CS student specializing in modern web development, clean UI, and JavaScript logic.",
        history: "Completed 8 successful peer exchange sessions with 5-star ratings.",
        teaches: ["HTML & CSS", "JavaScript"],
        wants: ["UI/UX Design"],
        searchKeywords: "html css javascript programming web development maryam niaz", //Example: Agar koi JavaScript search kare toh Maryam ka profile search results mein aa sakta hai.
        rating: 4.8,
        reviewsCount: 12
    },
    {
        id: 2,
        name: "Ali Mansoor",
        role: "Fine Arts & Media",
        initials: "AM",
        category: "Design",
        level: "Expert",
        verified: true,
        online: false,
        bio: "Digital artist and branding enthusiast looking to master programming fundamentals.",
        history: "Completed 14 successful design exchanges.",
        teaches: ["Graphic Design", "Photoshop"],
        wants: ["Python Basics"],
        searchKeywords: "graphic design photoshop design creative ali mansoor",
        rating: 4.9,
        reviewsCount: 18
    },
    {
        id: 3,
        name: "Zainab Khan",
        role: "Software Engineering",
        initials: "ZK",
        category: "Programming",
        level: "Advanced",
        verified: true,
        online: true,
        bio: "SE student deeply interested in data structures, algorithms, and backend logic.",
        history: "Completed 6 successful coding mentorships.",
        teaches: ["Python", "Data Structures"],
        wants: ["JavaScript"],
        searchKeywords: "python data structures programming coding zainab khan",
        rating: 4.7,
        reviewsCount: 9
    },
    {
        id: 4,
        name: "Hamza Tariq",
        role: "UI/UX Designer",
        initials: "HT",
        category: "Design",
        level: "Expert",
        verified: false,
        online: true,
        bio: "Creating intuitive user experiences and interactive prototypes using Figma.",
        history: "Completed 19 UI/UX project reviews.",
        teaches: ["Figma", "UI/UX Wireframing"],
        wants: ["React.js"],
        searchKeywords: "figma ui ux wireframing design prototyping hamza tariq",
        rating: 4.9,
        reviewsCount: 21
    },
    {
        id: 5,
        name: "Sana Malik",
        role: "Data Science Enthusiast",
        initials: "SM",
        category: "Programming",
        level: "Intermediate",
        verified: true,
        online: false,
        bio: "Exploring machine learning models, data visualization, and pandas pipelines.",
        history: "Completed 5 data analysis exchanges.",
        teaches: ["Machine Learning", "Pandas"],
        wants: ["Graphic Design"],
        searchKeywords: "machine learning python pandas data science sana malik",
        rating: 4.6,
        reviewsCount: 14
    },
    {
        id: 6,
        name: "Bilal Ahmad",
        role: "Languages & Linguistics",
        initials: "BA",
        category: "Languages",
        level: "Advanced",
        verified: true,
        online: true,
        bio: "Polyglot passionate about cross-cultural communication and conversational fluency.",
        history: "Completed 15 language exchange sessions.",
        teaches: ["Spanish", "French Conversational"],
        wants: ["Web Development"],
        searchKeywords: "spanish french languages conversational speaking bilal ahmad",
        rating: 4.8,
        reviewsCount: 19
    },
    {
        id: 7,
        name: "Kashif Raza",
        role: "Cybersecurity Major",
        initials: "KR",
        category: "Programming",
        level: "Advanced",
        verified: true,
        online: true,
        bio: "Network security enthusiast learning ethical hacking and system hardening.",
        history: "Completed 10 security audit exchanges.",
        teaches: ["Linux Commands", "Network Security"],
        wants: ["Cloud Computing"],
        searchKeywords: "linux cybersecurity networking security kashif raza",
        rating: 4.9,
        reviewsCount: 15
    },
    {
        id: 8,
        name: "Ayesha Siddiqui",
        role: "Digital Marketing Student",
        initials: "AS",
        category: "Design",
        level: "Intermediate",
        verified: true,
        online: false,
        bio: "Focused on social media growth strategies, SEO optimization, and content creation.",
        history: "Completed 8 marketing project reviews.",
        teaches: ["SEO Basics", "Content Writing"],
        wants: ["Video Editing"],
        searchKeywords: "seo marketing content writing digital ayesha siddiqui", 
        rating: 4.7,
        reviewsCount: 11
    }
];

let currentPage = 1;
const itemsPerPage = 6; //ek page par maximum 6 user profiles show honge.
let filteredUsersCache = [];

function renderExploreCards(usersToRender) { //Ye function explore page par user cards render karta hai.
    filteredUsersCache = usersToRender; 
    const grid = document.getElementById("exploreGrid"); //exploreGrid — jahan user cards show honge.
    const counterEl = document.getElementById("resultsCounter"); //Ye element show karta hai ke kitne results available hain aur kaunse results currently show ho rahe hain.
    const resetBtn = document.getElementById("resetFiltersBtn"); //Ye button show karta hai ke agar user ne koi filter ya search apply kiya hai to usay reset karne ka option mile.
    const paginationContainer = document.getElementById("paginationContainer"); //Ye container pagination buttons ko hold karega, jisse user next ya previous page par navigate kar sake.
    if (!grid) return; //Agar grid element exist nahi karta to function yahi ruk jata hai aur aage ka code execute nahi hota.

    // Calculate Slice indices for current page
    const totalPages = Math.ceil(usersToRender.length / itemsPerPage) || 1; //total users count /users ko 6 se divide karna.(14/6 = 2.33 => 3 pages) 
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * itemsPerPage; //Ye calculate karta hai ke current page par kaunsa index se start karna hai. (1st page: 0, 2nd page: 6, 3rd page: 12)
    const paginatedUsers = usersToRender.slice(startIndex, startIndex + itemsPerPage);//Ye slice karta hai usersToRender array ko startIndex se lekar startIndex + itemsPerPage tak, jisse current page ke liye sirf 6 users show honge.

    // Update Counter Text
    if (counterEl) {
        counterEl.innerText = `Showing ${paginatedUsers.length > 0 ? startIndex + 1 : 0}-${Math.min(startIndex + itemsPerPage, usersToRender.length)} of ${usersToRender.length} partner profiles`; //Ye text show karta hai ke currently kaunse results show ho rahe hain aur total kitne results available hain.(Showing 1-6 of 14 partner profiles)
    }

    if (usersToRender.length === 0) { //Agar search ya filter ke baad koi user match nahi karta:
        grid.innerHTML = `<p class="explore-empty-state">No skill exchange partners found matching your criteria.</p>`;
        if (paginationContainer) paginationContainer.innerHTML = ""; //Pagination buttons remove ho jate hain.
        if (resetBtn) resetBtn.classList.remove("hidden"); //Reset button show ho jata hai, jisse user filters reset kar sake.
        return;
    }

    // Show/Hide reset button
    const searchInput = document.getElementById("searchInput").value;
    const catFilter = document.getElementById("categoryFilter").value;
    const lvlFilter = document.getElementById("levelFilter").value;
    const srtFilter = document.getElementById("sortFilter").value;

    if (searchInput || catFilter || lvlFilter || srtFilter) {
        if (resetBtn) resetBtn.classList.remove("hidden"); //Agar user ne koi filter ya search apply kiya hai to reset button show ho jata hai.
    } else {
        if (resetBtn) resetBtn.classList.add("hidden"); //Agar user ne koi filter ya search apply nahi kiya hai to reset button hide ho jata hai.
    }

    // Render Cards for current page

    //map() — har user ke liye HTML card generate karta hai.
    grid.innerHTML = paginatedUsers.map(user => ` 
        <div class="skill-card-explore" onclick="openProfileModal(${user.id})" > 
            <div class="user-info-explore">
                <div class="user-avatar-explore user-avatar-wrap">
                    ${user.initials}
                    <span class="explore-online-indicator ${user.online ? "is-online" : "is-offline"}"></span>
                </div>
                <div class="explore-user-details">
                    <div class="explore-user-name-row">
                        <h3>${user.name}</h3>
                        ${user.verified ? '<span title="Verified Student" class="verified-student"><i class="fa-solid fa-circle-check"></i></span>' : ''}
                    </div>
                    <span class="explore-user-role">${user.role}</span>
                </div>
            </div>
            
            <p class="explore-user-bio">${user.bio}</p>

            <div class="badge-container-explore">
                <div class="badge-group">
                    <strong>Teaches:</strong>
                    ${user.teaches.map(t => `<span class="badge badge-teach">${t}</span>`).join('')}
                </div>
                <div class="badge-group learning-badge-group">
                    <strong>Wants to Learn:</strong>
                    ${user.wants.map(w => `<span class="badge badge-learn">${w}</span>`).join('')}
                </div>
            </div>

            <div class="explore-user-meta">
                <span class="explore-user-level">Level: <strong>${user.level}</strong></span>
                <span class="explore-user-presence ${user.online ? "is-online" : "is-offline"}"><i class="fa-solid fa-circle"></i> ${user.online ? 'Online Now' : 'Offline'}</span>
            </div>

            <div class="card-footer-explore" onclick="event.stopPropagation()">
                <div class="rating"><i class="fas fa-star"></i> ${user.rating} (${user.reviewsCount})</div>
                <div class="card-top-action">
                    <button class="btn-secondary quick-chat-button" onclick="quickMessage('${user.name}')" title="Send Quick Inquiry">
                        <i class="fa-solid fa-comment-dots" aria-hidden="true"></i> Chat
                    </button>
                    <button class="btn-swap" onclick="sendSwapRequest('${user.name}', '${user.teaches[0]}')">Request Swap</button>
                </div>
            </div>
        </div>
    `).join('');

    // Render Pagination Buttons
    renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) { //Ye pagination buttons create karne wala function call karta hai.
    const container = document.getElementById("paginationContainer");
    if (!container) return;


    //Agar sirf ek page hai toh pagination buttons show nahi honge.
    if (totalPages <= 1) {
        container.innerHTML = "";
        return;
    }

    // Generate buttons dynamically based on totalPages
    let buttonsHTML = "";
    for (let i = 1; i <= totalPages; i++) {
        buttonsHTML += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    container.innerHTML = buttonsHTML;
}

function goToPage(pageNumber) { //Ye function currentPage ko update karta hai aur explore cards ko render karta hai.
    currentPage = pageNumber; 
    renderExploreCards(filteredUsersCache);
    window.scrollTo({ top: 200, behavior: 'smooth' }); //(page ko kisi position tak scroll karta hai.)Scroll to top of the explore section for better UX when navigating pages.
}

function filterSkills() { //Ye function search aur filter apply karta hai.
    currentPage = 1; // ka matlab: jab bhi user search ya filter change kare, results first page se show hon.
    const searchInput = document.getElementById("searchInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const levelFilter = document.getElementById("levelFilter");
    const sortFilter = document.getElementById("sortFilter");
    if (!searchInput || !categoryFilter) return;

    //query — search bar mein likha hua text.
    let query = searchInput.value.toLowerCase();
    let category = categoryFilter.value;
    let level = levelFilter.value;
    let sortBy = sortFilter.value;

    let filtered = exploreUsers.filter(user => {
        let matchesQuery = user.searchKeywords.toLowerCase().includes(query) || user.name.toLowerCase().includes(query);
        let matchesCategory = (category === "" || user.category === category);
        let matchesLevel = (level === "" || user.level === level);
        return matchesQuery && matchesCategory && matchesLevel;
    });

//Agar sorting option rating hai toh users highest rating se lowest rating ki taraf arrange honge.
    if (sortBy === "rating") {
        filtered.sort((a, b) => b.rating - a.rating); //b.rating - a.rating — descending order mein sorting.
    }

    renderExploreCards(filtered); //Filtered users ko screen par display karta hai.
}

function resetAllFilters() {
    currentPage = 1; //Reset current page to 1 when filters are reset
    document.getElementById("searchInput").value = "";
    document.getElementById("categoryFilter").value = "";
    document.getElementById("levelFilter").value = "";
    document.getElementById("sortFilter").value = "";
    renderExploreCards(exploreUsers); //Saare users dobara display karta hai.
}

//Ye selected user ki complete profile open karta hai.
function openProfileModal(userId) {
    const user = exploreUsers.find(u => u.id === userId); //u.id === userId — user ki ID match karta hai.
    if (!user) return;

    const modalBody = document.getElementById("modalBodyContent");
    modalBody.innerHTML = `
        <div class="profile-modal-identity">
            <div class="user-avatar-explore profile-modal-avatar">${user.initials}</div>
            <div>
                <div class="profile-modal-name-row">
                    <h2>${user.name}</h2>
                    ${user.verified ? '<span title="Verified Student" class="verified-student profile-modal-verified"><i class="fa-solid fa-circle-check"></i></span>' : ''}
                </div>
                <p class="profile-modal-role">${user.role} <span class="explore-user-presence ${user.online ? "is-online" : "is-offline"}">${user.online ? 'Online' : 'Offline'}</span></p>
            </div>
        </div>

        <div class="profile-modal-section">
            <h4>About Student Bio</h4>
            <p>${user.bio}</p>
        </div>

        <div class="profile-modal-section">
            <h4>Exchange History & Trust</h4>
            <p><i class="fa-solid fa-award profile-modal-award"></i> ${user.history}</p>
        </div>

        <div class="profile-modal-skills">
            <div>
                <strong>TEACHES:</strong>
                ${user.teaches.map(t => `<span class="badge badge-teach">${t}</span>`).join('')}
            </div>
            <div>
                <strong>WANTS TO LEARN:</strong>
                ${user.wants.map(w => `<span class="badge badge-learn">${w}</span>`).join('')}
            </div>
        </div>

        <div class="profile-modal-footer">
            <div class="rating profile-modal-rating"><i class="fas fa-star"></i> ${user.rating} <span>(${user.reviewsCount} reviews)</span></div>
            <button class="btn-primary" onclick="closeProfileModal(); sendSwapRequest('${user.name}')">Request Swap Now</button>
        </div>
    `;

    document.getElementById("profileModal").classList.remove("hidden"); //Modal se hidden class remove hoti hai, jis se profile modal visible ho jata hai.
}

function closeProfileModal() {
    document.getElementById("profileModal").classList.add("hidden"); //Profile modal ko close karta hai aur hidden class add karta hai, jis se modal hide ho jata hai.
}

let currentInquiryPartner = "";

function quickMessage(partnerName) {
    if (!getDemoSession()) {
        window.location.assign("login.html");
        return;
    }

    currentInquiryPartner = partnerName;
    const titleEl = document.getElementById("inquiryModalTitle");
    if (titleEl) {
        titleEl.innerText = `Send Message to ${partnerName}`;
    }
    const textArea = document.getElementById("inquiryMessageText");
    if (textArea) {
        textArea.value = "";
    }
    document.getElementById("inquiryModal").classList.remove("hidden");
}

function closeInquiryModal() {
    document.getElementById("inquiryModal").classList.add("hidden");
}

function submitInquiryMessage() {
    const textArea = document.getElementById("inquiryMessageText");
    const message = textArea ? textArea.value.trim() : ""; 
    
    if (!message) {
        alert("Please write a message before sending.");
        return;
    }

    // Close the inquiry modal smoothly
    closeInquiryModal();

    // Show a professional inline success message instead of an ugly browser popup
    showToast(`Message successfully sent to ${currentInquiryPartner}!`);
}

// Professional Toast Notification Helper
function showToast(text) {
    let existingToast = document.getElementById("saasToastNotification");
    if (existingToast) existingToast.remove();//Agar pehle se toast notification present hai toh usko remove karta hai

    const toast = document.createElement("div");
    toast.id = "saasToastNotification";
    toast.className = "toast-notification";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.textContent = text;
    
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("is-exiting");
        setTimeout(() => toast.remove(), 500);
    }, 3500);
}

//Ye code ensure karta hai ke HTML load hone ke baad JavaScript functions execute hon.
document.addEventListener("DOMContentLoaded", () => {
    if (typeof renderDashboard === "function") renderDashboard();
    renderExploreCards(exploreUsers);
});

// ==========================================
// 3. SKILLSWAP ASSISTANT
// ==========================================

//Ye variable count karta hai ke assistant ke kitne replies abhi pending hain.
let pendingAssistantReplies = 0;

function getAssistantResponse(message) {
    const text = message.toLowerCase();

    //Greeting check(regular expression)
    if (/^(hi|hello|hey)( there)?[!. ]*$/.test(text)) {
        return {
            text: "Hi! I can help you find a learning partner, manage your profile, or understand the exchange process. What are you working on?"
        };
    }

    if (text.includes("how") && (text.includes("swap") || text.includes("exchange"))) {
        return {
            text: "A skill swap is a peer-to-peer exchange: offer a skill you can teach and request one you want to learn. Find a compatible member, send a request, and coordinate the details together.",
            linkText: "Explore potential partners",
            href: "explore.html"
        };
    }

    if (text.includes("profile") || text.includes("edit") || text.includes("teach") || text.includes("learn") && text.includes("skill")) {
        return {
            text: "You can update your bio and the skills you teach or want to learn from My Profile. Your skill lists are shared with the Dashboard.",
            linkText: "Open My Profile",
            href: "profile.html"
        };
    }

    if (text.includes("request") || text.includes("status") || text.includes("pending") || text.includes("accepted")) {
        return {
            text: "You can review exchange request statuses in the Dashboard. Open the requests section to see pending and accepted swaps.",
            linkText: "View exchange requests",
            href: "dashboard.html#requests"
        };
    }

    if (text.includes("schedule") || text.includes("session") || text.includes("when can") || text.includes("availability")) {
        return {
            text: "Once you find a partner, use the chat option on their card to agree on a time and format that works for both of you.",
            linkText: "Find a partner",
            href: "explore.html"
        };
    }

    if (text.includes("mentor") || text.includes("partner") || text.includes("match") || text.includes("find") ||
        text.includes("python") || text.includes("design") || text.includes("javascript") || text.includes("programming")) {
        return {
            text: "Explore members by skill, category, and experience level. Open a partner card to learn more and send an exchange request.",
            linkText: "Explore skills",
            href: "explore.html"
        };
    }

    if (text.includes("thank") || text.includes("thanks")) {
        return { text: "You’re welcome! I’m here if you need help with your profile, skill matches, or exchange requests." };
    }

    return {
        text: "I can help with finding skill partners, editing your profile, understanding skill swaps, and checking request status. Which would you like to explore?"
    };
}

//Ye function chat window mein message display karta hai.
function appendAssistantMessage(container, text, sender, linkText, href) {
    const message = document.createElement("div");
    message.className = sender === "user" ? "chat-msg sent" : "chat-msg received assistant-message";

    //Naya paragraph create hota hai, usmein message text add hota hai aur phir message div ke andar insert hota hai.
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    message.appendChild(paragraph);

    //Agar link ka text aur address dono available hon toh clickable link create hota hai.
    if (linkText && href) {
        const link = document.createElement("a");
        link.className = "assistant-reply-link";
        link.href = href;
        link.textContent = linkText;
        message.appendChild(link);
    }

    //Ye current time show karta hai, jaise 10:28 AM.
    const time = document.createElement("span");
    time.className = "msg-time";
    time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });//new Date() — current date aur time,toLocaleTimeString() — time ko readable format mein convert karta hai.
    message.appendChild(time);

    container.appendChild(message);
    container.scrollTop = container.scrollHeight;//Message chat container mein add hota hai aur chat automatically bottom tak scroll ho jati hai.
}

//Ye chatbot mein typing animation show karta hai.
function appendAssistantTyping(container) {
    const typing = document.createElement("div");
    typing.className = "chat-msg received assistant-message";
    typing.setAttribute("role", "status");
    typing.setAttribute("aria-label", "Assistant is typing");

    const dots = document.createElement("span");
    dots.className = "assistant-typing";
    for (let index = 0; index < 3; index += 1) {
        dots.appendChild(document.createElement("span"));
    }
    typing.appendChild(dots);
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
    return typing;
}

function sendBotMessage(event) {
    event.preventDefault();
    const inputField = document.getElementById("botChatInput");
    const chatMessages = document.getElementById("botChatMessages");
    const messageText = inputField.value.trim();

    if (!messageText || !chatMessages) return; //Agar message empty hai ya chatMessages element exist nahi karta to function yahi ruk jata hai aur aage ka code execute nahi hota.

    appendAssistantMessage(chatMessages, messageText, "user"); //User ka message chat window mein show hota hai.
    inputField.value = "";

    const response = getAssistantResponse(messageText); //user ke message ke according chatbot ka answer select karta hai.
    const typingIndicator = appendAssistantTyping(chatMessages);//typing animation show karta hai.
    pendingAssistantReplies += 1; //Pending replies ka counter increase hota hai aur chat ko busy status diya jata hai
    chatMessages.setAttribute("aria-busy", "true");

    setTimeout(() => {
        typingIndicator.remove();
        appendAssistantMessage(chatMessages, response.text, "assistant", response.linkText, response.href);
        pendingAssistantReplies -= 1;
        if (pendingAssistantReplies === 0) {
            chatMessages.removeAttribute("aria-busy");
        }
    }, 450);
}
// 450 milliseconds baad:
// 1. Typing animation remove hoti hai.
// 2. Assistant ka reply display hota hai.
// 3. Pending replies ki count decrease hoti hai.

document.querySelectorAll("[data-chat-prompt]").forEach(prompt => {
    prompt.addEventListener("click", () => {
        const input = document.getElementById("botChatInput");
        const form = input.closest("form");
        input.value = prompt.dataset.chatPrompt;
        form.requestSubmit();
    });
});
// Jab user suggested prompt par click karta hai:
// 1. Chat input select hota hai.
// 2. Uska parent form find hota hai.
// 3. Prompt ka text input mein set hota hai.
// 4. requestSubmit() form submit kar deta hai.
// Matlab user ko manually message type nahi karna padta.

//Ye notification bell ka dropdown open aur close karta hai.
function toggleNotifications() {
    const dropdown = document.getElementById("notificationDropdown");
    dropdown.classList.toggle("active"); //Ye bell icon ke click hone par dropdown ko toggle karta hai.
}

function clearNotifications() {
    const list = document.getElementById("notificationList");
    list.innerHTML = `<li class="notification-empty-state">No new notifications</li>`;
}

// Bahar click karne par dropdown close ho jaye
window.addEventListener("click", function(e) {
    const container = document.querySelector(".notification-container");
    if (container && !container.contains(e.target)) {
        document.getElementById("notificationDropdown").classList.remove("active");
    }
});

//HTML load hone ke baad dashboard render hota hai, agar function available ho.
document.addEventListener("DOMContentLoaded", () => {
    if (typeof renderDashboard === "function") renderDashboard();
    
    // Dashboard khulne par Notification bell ko ring karne ke liye
    const bellIcon = document.querySelector(".notification-container i, .fa-bell"); 
    if (bellIcon) {
        bellIcon.classList.add("ring-animation");
        
        // Agar aap chahte hain ke animation sirf kuch seconds ke liye chale aur phir ruk jaye:
        setTimeout(() => {
            bellIcon.classList.remove("ring-animation");
        }, 3000); // 3 seconds baad animation band ho jayegi
    }
});


//Profile page initialization function
function initializeLegacyProfilePage() {
    const form = document.getElementById("profileEditForm"); //Profile edit form ko select karta hai.
    if (!form) return;

    const profileStorageKey = "skillbridge_dashboard"; //localStorage mein profile aur dashboard data save karne ke liye key.
    const defaultProfile = {
        name: "Ayesha Hamid",
        role: "Software Engineering Student",
        location: "Lahore, Pakistan",
        bio: "I’m a software engineering student who enjoys building useful things and learning from others. I can help with web development fundamentals, and I’m currently exploring design and Python."
    };
    const defaultDashboardData = {
        teachSkills: ["HTML & CSS", "JavaScript", "Bootstrap"],
        learnSkills: ["Graphic Design", "UI/UX", "Python"],
        requests: [
            { id: 1, name: "Ali Mansoor", offer: "Graphic Design", request: "HTML & CSS", match: "95%", status: "Accepted" },
            { id: 2, name: "Zainab Khan", offer: "Python", request: "JavaScript", match: "88%", status: "Pending" }
        ],
        recommendedMatches: [
            { id: 101, name: "Ali Mansoor", teaches: "Graphic Design", wants: "HTML & CSS", score: "95% Match" },
            { id: 102, name: "Bilal Ahmad", teaches: "UI/UX Design", wants: "JavaScript", score: "90% Match" }
        ]
    };
    //HTML elements ko ek object mein store karna
    //Yahan JavaScript HTML ke different elements ko select karke ek object elements mein store kar rahi hai.
    const elements = {
        avatar: document.getElementById("profileAvatar"),
        name: document.getElementById("profileDisplayName"),
        role: document.getElementById("profileRole"),
        location: document.getElementById("profileLocation"),
        bio: document.getElementById("profileBio"),
        teachSkills: document.getElementById("profileTeachSkills"),
        learnSkills: document.getElementById("profileLearnSkills"),
        status: document.getElementById("profileSaveStatus"),
        overlay: document.getElementById("profileEditOverlay"),
        formError: document.getElementById("profileFormError"),
        nameInput: document.getElementById("editProfileName"),
        roleInput: document.getElementById("editProfileRole"),
        locationInput: document.getElementById("editProfileLocation"),
        bioInput: document.getElementById("editProfileBio"),
        teachInput: document.getElementById("editTeachSkills"),
        learnInput: document.getElementById("editLearnSkills")
    };
    let dashboardData; //dashboard ka saved data rakhega.
    let profile; //user ki profile information rakhega.
    let lastEditorTrigger; //editing popup open karne wale last element ko track karega.

    //Ye function browser ke localStorage se saved data read karta hai.
    function readProfileData() {
        const savedData = localStorage.getItem(profileStorageKey);
        const data = savedData
            ? JSON.parse(savedData)
            : JSON.parse(JSON.stringify(defaultDashboardData));

        //Ye check karta hai ke saved data correct format mein hai ya nahi.
            if (!data || typeof data !== "object" || Array.isArray(data)) { //check karta hai ke value array hai ya nahi.
            throw new Error("Saved dashboard data is not in the expected format.");
        }

        for (const key of ["teachSkills", "learnSkills"]) {
            //  //agr html,ccs,js h to ye valid h ,agr html1,123,js to ye invalid h
            if (!Array.isArray(data[key]) || !data[key].every(skill => typeof skill === "string")) { //.every() check karta hai ke array ke har element ki type string hai.
                throw new Error(`The saved ${key === "teachSkills" ? "teaching" : "learning"} skills are not in the expected format.`);
            }
        }

//   Ye check karta hai ke dashboard data ke andar profile property exist karti hai ya nahi.
// - hasOwnProperty.call() — object mein apni property check karta hai.
// - Agar profile available hai toh data.profile use hoga.
// - Warna defaultProfile use hoga.
        const savedProfile = Object.prototype.hasOwnProperty.call(data, "profile")
            ? data.profile
            : defaultProfile;

        //Ye check karta hai ke saved profile object correct format mein hai ya nahi.(object hai ya nahi, array nahi hai)
        if (!savedProfile || typeof savedProfile !== "object" || Array.isArray(savedProfile)) {
            throw new Error("Saved profile details are not in the expected format.");
        }


        //Spread Operator (...) hai.=>Iska kaam dono objects ki properties ko combine karna hai
        //e:g default profile mein name, role, location, bio hain aur saved profile mein bhi ye properties hain. Agar saved profile mein koi property missing hai to default profile ki value use hogi.

        const profileData = { ...defaultProfile, ...savedProfile };
        if (!["name", "role", "location", "bio"].every(key => typeof profileData[key] === "string")) { //Ye check karta hai ke name, role, location aur bio sab strings hon.
            throw new Error("One or more saved profile fields are not text.");
        }

        return { data, profile: profileData };//Ye function ek object return karta hai jismein dashboard data aur profile data dono hote hain.
    }

    //Is function ka kaam profile page par skills display karna hai.
    function renderSkills(list, skills) {
        list.replaceChildren();//ka matlab hai list ke andar jo purane HTML elements hain unko remove kar do.
        if (skills.length === 0) {//Agar skills array empty hai to ek message show karega.(Agar user ne koi skill add nahi ki:)
            const emptyItem = document.createElement("li");
            emptyItem.className = "profile-empty-skill";
            emptyItem.textContent = "No skills added yet";
            list.appendChild(emptyItem);
            return;
        }

        skills.forEach(skill => {
            const item = document.createElement("li");
            item.textContent = skill;
            list.appendChild(item);
        });
    }

    //Ye function user ki complete profile information webpage par display karta hai.
    function renderProfile() {
        const initials = profile.name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase();//Ye code user ke name ke initials calculate karta hai. Agar name "Ayesha Hamid" hai to initials "AH" honge.(map(part => part.charAt(0)) — dono words ka first letter leta hai.)
        
//Ye lines profile ke HTML elements mein information insert karti hain.
// - avatar — initials show karta hai.
// - aria-label — screen reader ke liye accessible description.
// - name — user ka naam.
// - role — user ka role.
// - location — location.
// - bio — introduction.
        elements.avatar.textContent = initials;
        elements.avatar.setAttribute("aria-label", `${profile.name} initials`);
        elements.name.textContent = profile.name;
        elements.role.textContent = profile.role;
        elements.location.textContent = profile.location;
        elements.bio.textContent = profile.bio;

// Ye pehle banaya hua renderSkills() function call karta hai.
// - First line: Teaching skills display.
// - Second line: Learning skills display.
        renderSkills(elements.teachSkills, dashboardData.teachSkills);
        renderSkills(elements.learnSkills, dashboardData.learnSkills);
    }

    //Ye function profile save hone ya error hone ka status show karta hai.
    function showStatus(message, state) {
        elements.status.textContent = message;
        elements.status.className = `profile-save-status${state ? ` is-${state}` : ""}`;
    }

    //Ye function profile editor ko close karta hai.
    function closeEditor() {
        elements.overlay.hidden = true;
        document.body.classList.remove("profile-modal-open");
        if (lastEditorTrigger instanceof HTMLElement) {
            //focus() kisi HTML element ko keyboard focus deta hai.
            lastEditorTrigger.focus();//lastEditorTrigger — last element jisse profile editor open hua tha, uspe focus wapas set karta hai.
        }
    }

    //Is function ka purpose user ke entered skills ko clean aur organize karna hai.
    function parseSkillList(value) {
        //Set duplicate values ko allow nahi karta.
        const seen = new Set();//new Set() unique values store karne ke liye use hota hai.
        return value.split(",").map(skill => skill.trim()).filter(skill => {
            if (!skill) return false;
            const normalized = skill.toLocaleLowerCase();
            if (seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        });
    }

    //Ye function profile edit karne wala modal open karta hai.
    function openEditor(trigger) {
        lastEditorTrigger = trigger;//trigger — jis button se modal open hua, usko yaad rakhta hai,.value = profile.name — input field mein existing name show karta hai.
        elements.nameInput.value = profile.name;
        elements.roleInput.value = profile.role;
        elements.locationInput.value = profile.location;
        elements.bioInput.value = profile.bio;
        elements.teachInput.value = dashboardData.teachSkills.join(", ");
        elements.learnInput.value = dashboardData.learnSkills.join(", ");
        elements.formError.textContent = "";
        elements.overlay.hidden = false;
        document.body.classList.add("profile-modal-open");
        elements.nameInput.focus();
    }

    document.querySelectorAll("[data-open-profile-editor]").forEach(button => {
        button.addEventListener("click", () => openEditor(button));
    });
    document.getElementById("closeProfileEditor").addEventListener("click", closeEditor);
    document.getElementById("cancelProfileEditor").addEventListener("click", closeEditor);
    elements.overlay.addEventListener("click", event => {//Agar user modal ke bahar overlay par click kare, modal close ho jata ha
        if (event.target === elements.overlay) closeEditor();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !elements.overlay.hidden) closeEditor();//Agar modal open ho aur user keyboard se Escape press kare, modal close ho jata hai.
    });

    form.addEventListener("submit", event => {
        event.preventDefault();
        elements.formError.textContent = "";//Form error message clear karta hai.
        const updatedProfile = {
            name: elements.nameInput.value.trim(),
            role: elements.roleInput.value.trim(),
            location: elements.locationInput.value.trim(),
            bio: elements.bioInput.value.trim()
        };

        if (!updatedProfile.name || !updatedProfile.role) {
            elements.formError.textContent = "Please enter your name and role.";
            return;
        }

        const updatedDashboardData = {
            ...dashboardData,//...dashboardData — existing dashboard data ki properties copy karta hai.
            profile: updatedProfile,//profile ko updated values se replace karta hai.
            teachSkills: parseSkillList(elements.teachInput.value),//skills ko clean karta hai aur duplicates remove karta hai.
            learnSkills: parseSkillList(elements.learnInput.value)//Yeh user ki learning skills read karta hai aur parseSkillList() se clean karta hai.
        };

        try {//code execute karne ki koshish karta hai.
            localStorage.setItem(profileStorageKey, JSON.stringify(updatedDashboardData));
        } catch (error) {
            elements.formError.textContent = `Could not save your changes: ${error.message}`;
            return;
        }

        profile = updatedProfile;//current profile update.
        dashboardData = updatedDashboardData;//complete dashboard data update.
        renderProfile();//updated information screen par show.
        closeEditor();//edit modal band.
        showStatus("Your profile and skills have been saved.", "success");//success message display.
    });

    //jab profile page initialize hota hai:
    try {
        const saved = readProfileData();//saved data read karta hai.
        dashboardData = saved.data;//mein data store hota hai.
        profile = saved.profile;//mein profile information store hoti hai.
        renderProfile();//screen update karta hai.
    } catch (error) {
        showStatus(`Could not load your saved profile: ${error.message}`, "error");
    }
}

async function initializeServerProfilePage() {
    const form = document.getElementById("profileEditForm");
    const user = window.SKILLSWAP_USER;
    if (!form || !user) return;

    const profile = { ...user.profile };
    const setupRequired = !profile.profileComplete;
    const elements = {
        avatar: document.getElementById("profileAvatar"),
        name: document.getElementById("profileDisplayName"),
        role: document.getElementById("profileRole"),
        location: document.getElementById("profileLocation"),
        experience: document.getElementById("profileExperience"),
        bio: document.getElementById("profileBio"),
        teachSkills: document.getElementById("profileTeachSkills"),
        learnSkills: document.getElementById("profileLearnSkills"),
        status: document.getElementById("profileSaveStatus"),
        overlay: document.getElementById("profileEditOverlay"),
        formError: document.getElementById("profileFormError"),
        nameInput: document.getElementById("editProfileName"),
        roleInput: document.getElementById("editProfileRole"),
        locationInput: document.getElementById("editProfileLocation"),
        experienceInput: document.getElementById("editExperienceLevel"),
        bioInput: document.getElementById("editProfileBio"),
        teachInput: document.getElementById("editTeachSkills"),
        learnInput: document.getElementById("editLearnSkills"),
        pictureInput: document.getElementById("editProfilePicture"),
        removePicture: document.getElementById("removeProfilePicture"),
        saveButton: form.querySelector('[type="submit"]'),
        cancelButton: document.getElementById("cancelProfileEditor"),
        closeButton: document.getElementById("closeProfileEditor")
    };
    let removePicture = false;
    let selectedPicture = "";
    let lastEditorTrigger;

    function renderSkills(list, skills) {
        list.replaceChildren();
        if (!skills.length) {
            const emptyItem = document.createElement("li");
            emptyItem.className = "profile-empty-skill";
            emptyItem.textContent = "No skills added yet";
            list.appendChild(emptyItem);
            return;
        }
        skills.forEach(skill => {
            const item = document.createElement("li");
            item.textContent = skill;
            list.appendChild(item);
        });
    }

    function renderProfile() {
        const initials = user.fullName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
        const pictureUrl = selectedPicture || (removePicture ? null : profile.profilePictureUrl);
        elements.avatar.replaceChildren();
        if (pictureUrl) {
            const image = document.createElement("img");
            image.src = pictureUrl;
            image.alt = `${user.fullName} profile picture`;
            elements.avatar.appendChild(image);
        } else {
            elements.avatar.textContent = initials;
        }
        elements.avatar.setAttribute("aria-label", pictureUrl ? `${user.fullName} profile picture` : `${user.fullName} initials`);
        elements.name.textContent = user.fullName;
        elements.role.textContent = profile.role || "Add your role or study area";
        elements.location.textContent = profile.location || "Location not provided";
        elements.experience.textContent = profile.experienceLevel || "Experience not set";
        elements.bio.textContent = profile.bio || "Add a short introduction to your profile.";
        renderSkills(elements.teachSkills, profile.teachSkills);
        renderSkills(elements.learnSkills, profile.learnSkills);
        elements.removePicture.hidden = !profile.profilePictureUrl && !selectedPicture;
    }

    function openEditor(trigger) {
        lastEditorTrigger = trigger;
        elements.nameInput.value = user.fullName;
        elements.roleInput.value = profile.role;
        elements.locationInput.value = profile.location;
        elements.experienceInput.value = profile.experienceLevel;
        elements.bioInput.value = profile.bio;
        elements.teachInput.value = profile.teachSkills.join(", ");
        elements.learnInput.value = profile.learnSkills.join(", ");
        elements.formError.textContent = "";
        elements.overlay.hidden = false;
        document.body.classList.add("profile-modal-open");
        elements.nameInput.focus();
    }

    function closeEditor() {
        if (setupRequired) return;
        elements.overlay.hidden = true;
        document.body.classList.remove("profile-modal-open");
        if (lastEditorTrigger instanceof HTMLElement) lastEditorTrigger.focus();
    }

    function parseSkillList(value) {
        return [...new Set(value.split(",").map(skill => skill.trim()).filter(Boolean))];
    }

    document.querySelectorAll("[data-open-profile-editor]").forEach(button => {
        button.addEventListener("click", () => openEditor(button));
    });
    elements.closeButton.addEventListener("click", closeEditor);
    elements.cancelButton.addEventListener("click", closeEditor);
    elements.overlay.addEventListener("click", event => {
        if (event.target === elements.overlay) closeEditor();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !elements.overlay.hidden) closeEditor();
    });
    elements.pictureInput.addEventListener("change", () => {
        const file = elements.pictureInput.files[0];
        selectedPicture = "";
        removePicture = false;
        if (!file) return;
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
            elements.formError.textContent = "Choose a PNG, JPEG, or WebP image smaller than 2 MB.";
            elements.pictureInput.value = "";
            return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            selectedPicture = reader.result;
            const image = document.createElement("img");
            image.src = selectedPicture;
            image.alt = `${user.fullName} profile picture preview`;
            elements.avatar.replaceChildren(image);
            elements.removePicture.hidden = false;
        });
        reader.addEventListener("error", () => {
            elements.formError.textContent = "The selected picture could not be read.";
        });
        reader.readAsDataURL(file);
    });
    elements.removePicture.addEventListener("click", () => {
        selectedPicture = "";
        removePicture = Boolean(profile.profilePictureUrl);
        elements.pictureInput.value = "";
        renderProfile();
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        elements.formError.textContent = "";
        const payload = {
            fullName: elements.nameInput.value.trim(),
            role: elements.roleInput.value.trim(),
            location: elements.locationInput.value.trim(),
            experienceLevel: elements.experienceInput.value,
            bio: elements.bioInput.value.trim(),
            teachSkills: parseSkillList(elements.teachInput.value),
            learnSkills: parseSkillList(elements.learnInput.value)
        };
        if (selectedPicture) payload.profilePicture = selectedPicture;
        if (removePicture) payload.removeProfilePicture = true;

        elements.saveButton.disabled = true;
        elements.saveButton.textContent = setupRequired ? "Creating profile..." : "Saving...";
        try {
            await saveAuthenticatedProfile(payload);
            Object.assign(user, window.SKILLSWAP_USER);
            Object.assign(profile, window.SKILLSWAP_USER.profile);
            removePicture = false;
            selectedPicture = "";
            renderProfile();
            if (setupRequired) {
                window.location.assign("dashboard.html");
                return;
            }
            closeEditor();
            elements.status.textContent = "Your profile and skills have been saved.";
            elements.status.className = "profile-save-status is-success";
        } catch (error) {
            elements.formError.textContent = error.message;
        } finally {
            elements.saveButton.disabled = false;
            elements.saveButton.textContent = setupRequired ? "Create profile" : "Save changes";
        }
    });

    if (setupRequired) {
        elements.cancelButton.hidden = true;
        elements.closeButton.hidden = true;
        openEditor(null);
    }
    renderProfile();
}

//DOMContentLoaded ka matlab: jab HTML document load ho kar ready ho jaye, tab initializeProfilePage() run karo.
document.addEventListener("DOMContentLoaded", initializeServerProfilePage);


//Settings page initialization function
//Yahan website ki default settings define ki gayi hain:
function readSkillSwapPreferences() {
    const defaults = { darkMode: false, reduceMotion: false, emailUpdates: true };//Dark mode off,Reduced animations off,Email updates on
    const stored = localStorage.getItem("skillswap_preferences");//browser se saved settings read karta hai.
    if (!stored) return defaults;//Agar settings saved nahi hain, to default settings return hongi.

    const preferences = JSON.parse(stored);//Saved JSON string ko wapas JavaScript object mein convert karta hai.
    if (!preferences || typeof preferences !== "object" || Array.isArray(preferences) ||
        !["darkMode", "reduceMotion", "emailUpdates"].every(key => typeof preferences[key] === "boolean")) {
        throw new Error("Saved settings are not in the expected format.");
    }

    return { ...defaults, ...preferences };//Default settings aur saved settings ko merge karta hai. Saved settings ki values ko priority milti hai.
}

function applySkillSwapPreferences(preferences) {
    document.body.classList.toggle("theme-dark", preferences.darkMode);
    document.body.classList.toggle("reduced-motion", preferences.reduceMotion);
}

//Settings page initialize karne wala function.
function initializeSkillSwapSettings() {
    const status = document.getElementById("settingsSaveStatus");//settings save hone ka message show karne wala HTML element.
    let preferences;//settings store karne ke liye variable.

    try {
        preferences = readSkillSwapPreferences();//browser se saved settings read karta hai.
    } catch (error) {//Agar error aaye to default settings use hoti hain.
        preferences = { darkMode: false, reduceMotion: false, emailUpdates: true };
        if (status) {//Agar status element available ho, to error message show hota hai.
            status.textContent = `Could not load preferences: ${error.message}`;
            status.className = "settings-save-status is-error";
        } else {
            console.error("Could not load SkillSwap preferences.", error);
        }
    }

    applySkillSwapPreferences(preferences);//Saved preferences ko website par apply karta hai.

    const darkModeToggle = document.getElementById("darkModeToggle");
    const reduceMotionToggle = document.getElementById("reduceMotionToggle");
    const emailUpdatesToggle = document.getElementById("emailNotificationsToggle");
    if (!darkModeToggle || !reduceMotionToggle || !emailUpdatesToggle) return;//Agar in mein se koi bhi element HTML mein nahi mila, to function stop ho jayega.

    //checked checkbox/toggle ki value set karta hai.
    //Example: Agar darkMode true hai, to Dark Mode toggle ON show hoga.
    darkModeToggle.checked = preferences.darkMode;
    reduceMotionToggle.checked = preferences.reduceMotion;
    emailUpdatesToggle.checked = preferences.emailUpdates;

    function savePreferences(nextPreferences) {
        try {
            localStorage.setItem("skillswap_preferences", JSON.stringify(nextPreferences));
        } catch (error) {
            status.textContent = `Could not save preferences: ${error.message}`;
            status.className = "settings-save-status is-error";
            return false;
        }

        //Agar saving successful ho:
        preferences = nextPreferences;
        applySkillSwapPreferences(preferences);
        status.textContent = "Your preferences have been saved on this device.";
        status.className = "settings-save-status is-success";
        return true;
    }

    //Jab user kisi toggle ko ON/OFF karta hai, ye function current values read karke save karta hai.
    function updatePreferences() {
        savePreferences({
            darkMode: darkModeToggle.checked,
            reduceMotion: reduceMotionToggle.checked,
            emailUpdates: emailUpdatesToggle.checked
        });
    }

    [darkModeToggle, reduceMotionToggle, emailUpdatesToggle].forEach(toggle => {
        toggle.addEventListener("change", updatePreferences);
    });

    //Jab user Reset Settings button click karega, ye code execute hoga.
    document.getElementById("resetSettingsButton").addEventListener("click", () => {
        try {
            localStorage.removeItem("skillswap_preferences");//removeItem() localStorage se specified data delete karta hai.
        } catch (error) {
            status.textContent = `Could not reset preferences: ${error.message}`;
            status.className = "settings-save-status is-error";
            return;
        }

        //teeno toggles default position par aa jate hain.
        darkModeToggle.checked = false;
        reduceMotionToggle.checked = false;
        emailUpdatesToggle.checked = true;
        preferences = { darkMode: false, reduceMotion: false, emailUpdates: true };
        applySkillSwapPreferences(preferences);
        status.textContent = "Preferences have been reset.";
        status.className = "settings-save-status is-success";
    });
}

//Reviews page initialization function
//Ye function Reviews page ke form aur reviews list ko select karta hai.    
function initializeReviewsPage() {
    const form = document.getElementById("reviewForm");
    const reviewsList = document.getElementById("reviewsList");
    if (!form || !reviewsList) return;

    const status = document.getElementById("reviewFormStatus");//review submit hone ka message.
    const emptyState = document.getElementById("reviewsEmptyState");//jab koi review na ho to empty message.
    let reviews = [];//reviews store karne ke liye empty array.

    function showReviewStatus(message, state) {
        status.textContent = message;//jo text show karna hai.
        status.className = `app-form-status${state ? ` is-${state}` : ""}`;//success ya error jaisi condition.
    }

    function updateReviewSummary() {
        const allReviews = [...reviewsList.querySelectorAll(".saved-review")];//... spread operator — selected elements ko array mein convert karta hai,allReviews mein tamam reviews aa jate hain.
        const ratings = allReviews.map(review => Number(review.dataset.rating));//Ye line har review ke rating ko number mein convert karke ratings array mein store karti hai.
        const average = ratings.length//Ye average rating calculate karta hai.(5,4,3 => 5+4+3/3)
            ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length//reduce() — tamam ratings ko add karta hai,length:total ratings count karta hai,Agar ratings available hain to average calculate karo, warna 0.
            : 0;
        const roundedRating = Math.round(average);//nearest whole number mein round karta hai.

        //Average rating screen par show karta hai.
        document.getElementById("reviewsAverage").textContent = ratings.length ? average.toFixed(1) : "—";//toFixed(1) — decimal ke baad 1 digit show karta hai,Agar reviews nahi hain to dash — show hota hai.
        document.getElementById("reviewsCount").textContent = String(allReviews.length);
        document.getElementById("reviewCountLabel").textContent = allReviews.length === 1 ? "community review" : "community reviews";
        document.getElementById("reviewListCount").textContent = `${allReviews.length} ${allReviews.length === 1 ? "review" : "reviews"}`;
        document.getElementById("reviewSummaryStars").textContent = ratings.length
            ? "★".repeat(roundedRating) + "☆".repeat(5 - roundedRating)
            : "☆☆☆☆☆";//Agar reviews available nahi hain to 5 empty stars show honge.
        emptyState.hidden = allReviews.length > 0;//emptyState.hidden decide karta hai ke “No reviews yet” wala message show karna hai ya hide.
    }

    function createReviewCard(review) {
        const article = document.createElement("article");
        article.className = "review-entry saved-review";
        article.dataset.rating = String(review.rating);//review ki rating HTML ke custom data attribute mein store karta hai.

        //Ye reviewer ka naam show karne ke liye heading aur h3 element create karta hai.
        const heading = document.createElement("div");
        heading.className = "review-entry-heading";
        const authorDetails = document.createElement("div");
        const author = document.createElement("h3");
        author.textContent = review.name;
        const skill = document.createElement("p");
        skill.textContent = `${review.skill} exchange`;//jis skill ka exchange hua uska naam.
        authorDetails.append(author, skill);//multiple HTML elements ko ek parent element ke andar add karta hai.

        const rating = document.createElement("span");
        rating.className = "review-entry-rating";
        rating.setAttribute("aria-label", `${review.rating} out of 5 stars`);
        rating.textContent = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
        heading.append(authorDetails, rating);

        const comment = document.createElement("p");
        comment.className = "review-entry-comment";
        comment.textContent = review.comment;
        const date = document.createElement("time");
        date.className = "review-entry-date";
        date.dateTime = review.createdAt;
        date.textContent = new Date(review.createdAt).toLocaleDateString();
        article.append(heading, comment, date);
        return article;
    }


//Saved reviews load aur validate karna
    try {
        const storedReviews = localStorage.getItem("skillswap_reviews");
        reviews = storedReviews ? JSON.parse(storedReviews) : [];
        if (!Array.isArray(reviews) || !reviews.every(review =>//Check karta hai ke reviews array hain aur har review valid hai.
            review && typeof review.name === "string" && typeof review.skill === "string" &&
            typeof review.comment === "string" && Number.isInteger(review.rating) &&
            review.rating >= 1 && review.rating <= 5 && typeof review.createdAt === "string" &&
            !Number.isNaN(new Date(review.createdAt).getTime())//Check karta hai ke date string ho aur valid date mein convert ho sake.
        )) {
            throw new Error("Saved reviews are not in the expected format.");
        }
    } catch (error) {
        showReviewStatus(`Could not load saved reviews: ${error.message}`, "error");
        form.querySelector("button[type='submit']").disabled = true;
        updateReviewSummary();
        return;
    }

    reviews.forEach(review => reviewsList.insertBefore(createReviewCard(review), reviewsList.firstChild));//insertBefore() — card ko list ke start mein show karta hai.
    updateReviewSummary();

    //Jab user review form submit karta hai, ye function execute hota hai.
    form.addEventListener("submit", event => {
        event.preventDefault();
        const review = {
            name: document.getElementById("reviewerName").value.trim(),
            skill: document.getElementById("reviewSkill").value.trim(),
            rating: Number(document.getElementById("reviewRating").value),
            comment: document.getElementById("reviewComment").value.trim(),
            createdAt: new Date().toISOString()
        };

        //ye check krta h koi b field empty na ho
        if (!review.name || !review.skill || !review.comment || !Number.isInteger(review.rating) ||
            review.rating < 1 || review.rating > 5) {
            showReviewStatus("Please complete each field and select a rating.", "error");
            return;
        }

        const updatedReviews = [...reviews, review];//Spread operator existing reviews copy karta hai aur new review add karta hai.
        try {
            localStorage.setItem("skillswap_reviews", JSON.stringify(updatedReviews));
        } catch (error) {
            showReviewStatus(`Could not save your review: ${error.message}`, "error");
            return;
        }

        reviews = updatedReviews;
        reviewsList.insertBefore(createReviewCard(review), reviewsList.firstChild);
        updateReviewSummary();
        form.reset();
        showReviewStatus("Thanks! Your review has been added.", "success");
    });
}

document.addEventListener("DOMContentLoaded", initializeSkillSwapSettings);
document.addEventListener("DOMContentLoaded", initializeReviewsPage);

// Shared navigation and lightweight marketing-page interactions.
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".mobile-menu-toggle").forEach(button => {
        const navigation = document.getElementById(button.getAttribute("aria-controls"));
        if (!navigation) return;

        button.addEventListener("click", () => {
            const isOpen = button.getAttribute("aria-expanded") === "true";
            button.setAttribute("aria-expanded", String(!isOpen));
            button.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
            navigation.classList.toggle("is-open", !isOpen);
        });

        navigation.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => {
                button.setAttribute("aria-expanded", "false");
                button.setAttribute("aria-label", "Open navigation");
                navigation.classList.remove("is-open");
            });
        });
    });

    const revealItems = document.querySelectorAll(".reveal");
    if ("IntersectionObserver" in window && revealItems.length > 0) {
        document.documentElement.classList.add("motion-ready");
        const revealObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-visible");
                revealObserver.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -35px 0px" });
        revealItems.forEach(item => revealObserver.observe(item));
    }

    const carousel = document.getElementById("partnerCarousel");
    if (carousel) {
        const slides = Array.from(carousel.querySelectorAll(".partner-slide"));
        const dots = Array.from(document.querySelectorAll(".carousel-dot"));
        let activeSlide = 0;
        let carouselTimer;

        const showSlide = index => {
            activeSlide = (index + slides.length) % slides.length;
            slides.forEach((slide, slideIndex) => {
                const isActive = slideIndex === activeSlide;
                slide.hidden = !isActive;
                slide.classList.toggle("is-active", isActive);
            });
            dots.forEach((dot, dotIndex) => {
                const isActive = dotIndex === activeSlide;
                dot.classList.toggle("is-active", isActive);
                if (isActive) dot.setAttribute("aria-current", "true");
                else dot.removeAttribute("aria-current");
            });
        };

        document.querySelectorAll("[data-slide-to]").forEach(dot => {
            dot.addEventListener("click", () => showSlide(Number(dot.dataset.slideTo)));
        });
        document.querySelectorAll("[data-carousel-direction]").forEach(button => {
            button.addEventListener("click", () => showSlide(activeSlide + Number(button.dataset.carouselDirection)));
        });

        const reducedMotion = document.body.classList.contains("reduced-motion") ||
            (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        if (!reducedMotion && slides.length > 1) {
            const startCarousel = () => {
                window.clearInterval(carouselTimer);
                carouselTimer = window.setInterval(() => showSlide(activeSlide + 1), 6500);
            };
            const stopCarousel = () => window.clearInterval(carouselTimer);
            carousel.addEventListener("mouseenter", stopCarousel);
            carousel.addEventListener("mouseleave", startCarousel);
            carousel.addEventListener("focusin", stopCarousel);
            carousel.addEventListener("focusout", startCarousel);
            document.addEventListener("visibilitychange", () => {
                if (document.hidden) stopCarousel();
                else startCarousel();
            });
            startCarousel();
        }
    }

    const contactForm = document.getElementById("contactForm");
    if (contactForm) {
        const status = document.getElementById("contactFormStatus");
        contactForm.addEventListener("submit", event => {
            event.preventDefault();
            const fields = {
                name: document.getElementById("contactName"),
                email: document.getElementById("contactEmail"),
                subject: document.getElementById("contactSubject"),
                message: document.getElementById("contactMessage")
            };
            const invalidField = Object.values(fields).find(field => !field.value.trim() || !field.validity.valid);
            if (invalidField) {
                status.textContent = invalidField.type === "email" && invalidField.value.trim()
                    ? "Please enter a valid email address."
                    : "Please complete each field before continuing.";
                status.className = "contact-form-status is-error";
                invalidField.focus();
                return;
            }

            status.textContent = `Thanks, ${fields.name.value.trim()} — your note is ready. This demo does not send or store messages, so nothing has been transmitted.`;
            status.className = "contact-form-status";
            contactForm.reset();
        });
    }
});