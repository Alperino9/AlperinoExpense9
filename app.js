const STORAGE_KEY = "expense-tracker-transactions-v1";

const categoryGroups = {
  income: ["Maaş", "Serbest Çalışma", "Yatırım", "Hediye", "Satış", "Diğer"],
  expense: ["Gıda", "Eğlence", "Fatura", "Ulaşım", "Kira", "Sağlık", "Alışveriş", "Diğer"]
};

const state = {
  transactions: loadTransactions(),
  filters: {
    type: "all",
    category: "all"
  }
};

const elements = {
  welcomeScreen: document.querySelector("#welcomeScreen"),
  welcomeBalance: document.querySelector("#welcomeBalance"),
  openAppButton: document.querySelector("#openAppButton"),
  quickIncomeButton: document.querySelector("#quickIncomeButton"),
  quickExpenseButton: document.querySelector("#quickExpenseButton"),
  form: document.querySelector("#transactionForm"),
  amountInput: document.querySelector("#amountInput"),
  categoryInput: document.querySelector("#categoryInput"),
  dateInput: document.querySelector("#dateInput"),
  descriptionInput: document.querySelector("#descriptionInput"),
  formMessage: document.querySelector("#formMessage"),
  totalIncome: document.querySelector("#totalIncome"),
  totalExpense: document.querySelector("#totalExpense"),
  netBalance: document.querySelector("#netBalance"),
  balanceCard: document.querySelector("#balanceCard"),
  typeFilter: document.querySelector("#typeFilter"),
  categoryFilter: document.querySelector("#categoryFilter"),
  clearFiltersButton: document.querySelector("#clearFiltersButton"),
  transactionList: document.querySelector("#transactionList"),
  connectionStatus: document.querySelector("#connectionStatus")
};

const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY"
});

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "long",
  year: "numeric"
});

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  document.body.classList.add("welcome-open");
  elements.dateInput.value = getToday();
  populateCategoryInput(getSelectedType());
  populateCategoryFilter();
  renderApp();
  updateConnectionStatus();
  registerServiceWorker();

  elements.form.addEventListener("submit", handleFormSubmit);
  elements.typeFilter.addEventListener("change", handleTypeFilterChange);
  elements.categoryFilter.addEventListener("change", handleCategoryFilterChange);
  elements.clearFiltersButton.addEventListener("click", clearFilters);
  elements.openAppButton.addEventListener("click", closeWelcomeScreen);
  elements.quickIncomeButton.addEventListener("click", () => openFormForType("income"));
  elements.quickExpenseButton.addEventListener("click", () => openFormForType("expense"));
  elements.transactionList.addEventListener("click", handleTransactionListClick);
  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  document.querySelectorAll("input[name='type']").forEach((radio) => {
    radio.addEventListener("change", () => {
      populateCategoryInput(getSelectedType());
      clearFormMessage();
    });
  });
}

function handleFormSubmit(event) {
  event.preventDefault();

  const amount = Number(elements.amountInput.value);
  const type = getSelectedType();
  const category = elements.categoryInput.value;
  const date = elements.dateInput.value;
  const description = elements.descriptionInput.value.trim();

  if (!amount || amount <= 0) {
    showFormMessage("Lütfen sıfırdan büyük bir miktar girin.");
    return;
  }

  if (!category || !date) {
    showFormMessage("Kategori ve tarih alanlarını doldurun.");
    return;
  }

  const transaction = {
    id: createId(),
    type,
    amount,
    category,
    date,
    description: description || (type === "income" ? "Gelir kaydı" : "Gider kaydı"),
    createdAt: new Date().toISOString()
  };

  state.transactions.unshift(transaction);
  saveTransactions();
  elements.form.reset();
  document.querySelector("input[name='type'][value='expense']").checked = true;
  elements.dateInput.value = getToday();
  populateCategoryInput("expense");
  populateCategoryFilter();
  renderApp();
  showFormMessage("İşlem başarıyla eklendi.", "success");
}

function handleTypeFilterChange() {
  state.filters.type = elements.typeFilter.value;
  renderApp();
}

function handleCategoryFilterChange() {
  state.filters.category = elements.categoryFilter.value;
  renderApp();
}

function clearFilters() {
  state.filters.type = "all";
  state.filters.category = "all";
  elements.typeFilter.value = "all";
  elements.categoryFilter.value = "all";
  renderApp();
}

function handleTransactionListClick(event) {
  const deleteButton = event.target.closest("[data-delete-id]");

  if (!deleteButton) {
    return;
  }

  const id = deleteButton.dataset.deleteId;
  state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
  saveTransactions();
  populateCategoryFilter();
  renderApp();
}

function renderApp() {
  renderSummary();
  renderTransactions();
}

function renderSummary() {
  const totals = state.transactions.reduce(
    (accumulator, transaction) => {
      if (transaction.type === "income") {
        accumulator.income += transaction.amount;
      } else {
        accumulator.expense += transaction.amount;
      }

      return accumulator;
    },
    { income: 0, expense: 0 }
  );

  const balance = totals.income - totals.expense;

  elements.totalIncome.textContent = currencyFormatter.format(totals.income);
  elements.totalExpense.textContent = currencyFormatter.format(totals.expense);
  elements.netBalance.textContent = currencyFormatter.format(balance);
  elements.welcomeBalance.textContent = currencyFormatter.format(balance);
  elements.welcomeBalance.classList.toggle("positive", balance > 0);
  elements.welcomeBalance.classList.toggle("negative", balance < 0);
  elements.balanceCard.classList.toggle("positive", balance > 0);
  elements.balanceCard.classList.toggle("negative", balance < 0);
  elements.balanceCard.classList.toggle("neutral", balance === 0);
}

function closeWelcomeScreen() {
  elements.welcomeScreen.classList.add("hidden");
  document.body.classList.remove("welcome-open");
}

function openFormForType(type) {
  document.querySelector(`input[name='type'][value='${type}']`).checked = true;
  populateCategoryInput(type);
  closeWelcomeScreen();
  elements.amountInput.focus();
  elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTransactions() {
  const filteredTransactions = getFilteredTransactions();

  if (filteredTransactions.length === 0) {
    elements.transactionList.innerHTML = `
      <div class="empty-state">
        <div>
          <strong>Kayıt bulunamadı</strong>
          <span>Yeni bir işlem ekleyin veya filtreleri temizleyin.</span>
        </div>
      </div>
    `;
    return;
  }

  elements.transactionList.innerHTML = filteredTransactions
    .map((transaction) => {
      const amountPrefix = transaction.type === "income" ? "+" : "-";
      const typeLabel = transaction.type === "income" ? "Gelir" : "Gider";

      return `
        <article class="transaction-item">
          <div class="transaction-main">
            <div class="transaction-title">
              <strong title="${escapeHtml(transaction.description)}">${escapeHtml(transaction.description)}</strong>
              <span class="category-badge">${escapeHtml(transaction.category)}</span>
            </div>
            <div class="transaction-meta">
              <span>${typeLabel}</span>
              <span>${formatDate(transaction.date)}</span>
            </div>
          </div>
          <div class="transaction-amount ${transaction.type}">
            ${amountPrefix}${currencyFormatter.format(transaction.amount)}
          </div>
          <button class="delete-button" type="button" data-delete-id="${transaction.id}" aria-label="${escapeHtml(transaction.description)} işlemini sil">
            Sil
          </button>
        </article>
      `;
    })
    .join("");
}

function getFilteredTransactions() {
  return state.transactions.filter((transaction) => {
    const typeMatches = state.filters.type === "all" || transaction.type === state.filters.type;
    const categoryMatches = state.filters.category === "all" || transaction.category === state.filters.category;
    return typeMatches && categoryMatches;
  });
}

function populateCategoryInput(type) {
  elements.categoryInput.innerHTML = categoryGroups[type]
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");
}

function populateCategoryFilter() {
  const allCategories = new Set([...categoryGroups.income, ...categoryGroups.expense]);

  state.transactions.forEach((transaction) => {
    allCategories.add(transaction.category);
  });

  const previousValue = elements.categoryFilter.value || state.filters.category;
  elements.categoryFilter.innerHTML = `
    <option value="all">Tüm kategoriler</option>
    ${Array.from(allCategories)
      .sort((a, b) => a.localeCompare(b, "tr"))
      .map((category) => `<option value="${category}">${category}</option>`)
      .join("")}
  `;

  if (allCategories.has(previousValue)) {
    elements.categoryFilter.value = previousValue;
  } else {
    elements.categoryFilter.value = "all";
    state.filters.category = "all";
  }
}

function getSelectedType() {
  return document.querySelector("input[name='type']:checked").value;
}

function loadTransactions() {
  try {
    const savedTransactions = localStorage.getItem(STORAGE_KEY);
    return savedTransactions ? JSON.parse(savedTransactions) : [];
  } catch (error) {
    console.error("Kayıtlar okunamadı:", error);
    return [];
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return dateFormatter.format(date);
}

function showFormMessage(message, type = "error") {
  elements.formMessage.textContent = message;
  elements.formMessage.classList.toggle("success", type === "success");

  window.setTimeout(() => {
    clearFormMessage();
  }, 2800);
}

function clearFormMessage() {
  elements.formMessage.textContent = "";
  elements.formMessage.classList.remove("success");
}

function updateConnectionStatus() {
  const isOnline = navigator.onLine;
  elements.connectionStatus.classList.toggle("offline", !isOnline);
  elements.connectionStatus.querySelector("span:last-child").textContent = isOnline ? "Çevrimiçi" : "Offline";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      console.error("Service Worker kaydedilemedi:", error);
    }
  });
}
