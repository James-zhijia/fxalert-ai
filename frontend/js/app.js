
const form = document.getElementById("convertForm");
const result = document.getElementById("result");
const rateInfo = document.getElementById("rateInfo");
const dateInfo = document.getElementById("dateInfo");
const message = document.getElementById("message");


// 貨幣換算功能
async function convertCurrency(event) {
    event.preventDefault();

    const amount = document.getElementById("amount").value;
    const base = document.getElementById("base").value;
    const quote = document.getElementById("quote").value;

    // 建立 API 查詢參數
    const params = new URLSearchParams({
        amount: amount,
        base: base,
        quote: quote
    });

    const url = `/api/convert?${params.toString()}`;

    message.textContent = "正在查詢匯率...";
    result.textContent = "--";

    try {
        // 呼叫 FastAPI
        const response = await fetch(url);

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                typeof data.detail === "string"
                    ? data.detail
                    : "查詢失敗，請檢查輸入內容"
            );
        }

        // 顯示換算結果
        const amountNumber = Number(data.converted_amount);

        result.textContent =
            `${amountNumber.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })} ${data.quote}`;

        rateInfo.textContent =
            `1 ${data.base} = ${data.rate} ${data.quote}`;

        dateInfo.textContent =
            data.date
                ? `資料日期：${data.date}`
                : "相同貨幣換算";

        message.textContent = "換算成功！";

    } catch (error) {
        result.textContent = "--";
        rateInfo.textContent = "匯率：--";
        dateInfo.textContent = "資料日期：--";

        message.textContent =
            `發生錯誤：${error.message}`;
    }
}


// 使用者點擊換算按鈕時執行
form.addEventListener("submit", convertCurrency);

// 網頁載入時自動換算一次
convertCurrency(new Event("submit"));

let exchangeChart = null;

// 預設查詢最近 30 天
let selectedDays = 30;

// 避免舊請求覆蓋較新的查詢結果
let historyRequestId = 0;


// 查詢並顯示歷史匯率
async function loadHistory() {

    const requestId = ++historyRequestId;

    // 使用換算區目前選擇的幣別
    const base = document.getElementById("base").value;
    const quote = document.getElementById("quote").value;

    const historyMessage =
        document.getElementById("historyMessage");

    historyMessage.textContent = "正在載入歷史匯率...";

    // 避免切換期間時顯示舊統計資料
    document.getElementById("highestRate").textContent = "--";
    document.getElementById("lowestRate").textContent = "--";
    document.getElementById("changePercent").textContent = "--";
    document.getElementById("historyDate").textContent =
        "資料日期：--";

    // 歷史走勢不查詢相同貨幣
    if (base === quote) {
        if (exchangeChart) {
            exchangeChart.destroy();
            exchangeChart = null;
        }

        historyMessage.textContent =
            "請選擇兩種不同貨幣來查看歷史走勢";
        return;
    }

    // 建立查詢參數
    const params = new URLSearchParams({
        base: base,
        quote: quote,
        days: String(selectedDays)
    });

    try {
        const response = await fetch(
            `/api/rates/history?${params.toString()}`
        );

        const data = await response.json();

        // 如果使用者已切換條件，忽略舊回應
        if (requestId !== historyRequestId) {
            return;
        }

        if (!response.ok) {
            throw new Error(
                typeof data.detail === "string"
                    ? data.detail
                    : "歷史匯率查詢失敗"
            );
        }

        if (!Array.isArray(data.data) || !data.data.length) {
            throw new Error("沒有可用的歷史匯率資料");
        }

        // 日期作為 X 軸
        const labels = data.data.map(item => item.date);

        // 匯率作為 Y 軸
        const rates = data.data.map(
            item => Number(item.rate)
        );

        if (rates.some(rate => !Number.isFinite(rate))) {
            throw new Error("歷史匯率包含無效數字");
        }

        // 畫出折線圖
        renderExchangeChart(
            labels,
            rates,
            base,
            quote
        );

        // 顯示 Python 計算好的統計資料
        document.getElementById("highestRate").textContent =
            data.statistics.highest;

        document.getElementById("lowestRate").textContent =
            data.statistics.lowest;

        const change = Number(
            data.statistics.change_percent
        );

        const changeElement =
            document.getElementById("changePercent");

        changeElement.textContent =
            `${change > 0 ? "+" : ""}${change.toFixed(2)}%`;

        changeElement.classList.remove(
            "positive",
            "negative"
        );

        if (change > 0) {
            changeElement.classList.add("positive");
        } else if (change < 0) {
            changeElement.classList.add("negative");
        }

        document.getElementById("historyDate").textContent =
            `資料日期：${data.start_date} ～ ${data.end_date}`;

        historyMessage.textContent =
            `成功載入 ${data.data_points} 筆匯率資料`;

    } catch (error) {
        if (requestId !== historyRequestId) {
            return;
        }

        if (exchangeChart) {
            exchangeChart.destroy();
            exchangeChart = null;
        }

        historyMessage.textContent =
            `載入失敗：${error.message}`;
    }
}


// 使用 Chart.js 繪製折線圖
function renderExchangeChart(
    labels,
    rates,
    base,
    quote
) {

    const canvas =
        document.getElementById("exchangeChart");

    // 避免重複建立圖表
    if (exchangeChart) {
        exchangeChart.destroy();
    }

    exchangeChart = new Chart(canvas, {
        type: "line",

        data: {
            labels: labels,
            datasets: [{
                label: `${base}/${quote}`,
                data: rates,

                borderColor: "#818cf8",
                backgroundColor: "rgba(129, 140, 248, 0.12)",

                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointRadius: labels.length > 30 ? 0 : 3,
                pointHoverRadius: 6
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            plugins: {
                legend: {
                    labels: {
                        color: "#e2e8f0"
                    }
                },

                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `匯率：${context.parsed.y}`;
                        }
                    }
                }
            },

            scales: {
                x: {
                    ticks: {
                        color: "#94a3b8",
                        maxTicksLimit: 8
                    },
                    grid: {
                        color: "rgba(148, 163, 184, 0.08)"
                    }
                },

                y: {
                    ticks: {
                        color: "#94a3b8"
                    },
                    grid: {
                        color: "rgba(148, 163, 184, 0.12)"
                    }
                }
            }
        }
    });
}


// 7、30、90 天切換按鈕
document.querySelectorAll(".period-btn").forEach(button => {

    button.addEventListener("click", function () {

        selectedDays = Number(this.dataset.days);

        // 更新按鈕樣式
        document.querySelectorAll(".period-btn").forEach(btn => {
            btn.classList.remove("active");
        });

        this.classList.add("active");

        // 重新取得資料
        loadHistory();
    });
});


// 使用者更換貨幣時更新圖表
document.getElementById("base").addEventListener(
    "change",
    loadHistory
);

document.getElementById("quote").addEventListener(
    "change",
    loadHistory
);


// 網頁開啟時載入預設的 30 天資料
loadHistory();

const alertForm = document.getElementById("alertForm");
const alertList = document.getElementById("alertList");
const alertMessage = document.getElementById("alertMessage");
const alertCheckResult = document.getElementById("alertCheckResult");


// 統一處理 API 回應及錯誤
async function alertApi(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        const detail = data.detail;

        throw new Error(
            typeof detail === "string"
                ? detail
                : "API 請求失敗，請檢查輸入內容"
        );
    }

    return data;
}


// 建立 HTML 元素，避免直接插入外部資料
function createAlertElement(tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
}


// 1. 載入所有匯率提醒
async function loadAlerts() {
    alertList.textContent = "正在載入提醒資料...";

    try {
        const alerts = await alertApi("/api/alerts");

        alertList.replaceChildren();

        if (alerts.length === 0) {
            alertList.appendChild(
                createAlertElement(
                    "p",
                    "目前還沒有匯率提醒，可以先新增一筆。",
                    "text-secondary"
                )
            );
            return;
        }

        alerts.forEach(alert => {
            const card = document.createElement("div");
            card.className = "border rounded p-3 mb-3";

            // 貨幣組合
            const title = createAlertElement(
                "h6",
                `${alert.base} / ${alert.quote}`,
                "fw-bold mb-2"
            );

            // 提醒條件
            const operator = alert.operator === ">=" ? "≥" : "≤";

            const target = createAlertElement(
                "p",
                `目標匯率：${operator} ${alert.target_rate}`,
                "mb-2"
            );

            // 啟用狀態
            const status = createAlertElement(
                "p",
                alert.enabled
                    ? "狀態：已啟用"
                    : "狀態：已停用",
                "small text-secondary mb-2"
            );

            // 是否已達標
            const conditionMet = Boolean(alert.condition_met);

            const condition = createAlertElement(
                "span",
                !alert.enabled
                    ? "已停用"
                    : !alert.last_checked_at
                        ? "尚未檢查"
                        : conditionMet
                            ? "已達標"
                            : "未達標",
                !alert.enabled
                    ? "badge bg-secondary"
                    : !alert.last_checked_at
                        ? "badge bg-secondary"
                        : conditionMet
                            ? "badge bg-success"
                            : "badge bg-secondary"
            );


            // 修改目標匯率
            const editButton = createAlertElement(
                "button",
                "修改匯率",
                "btn btn-sm btn-outline-light mt-3 me-2"
            );

            editButton.type = "button";

            editButton.addEventListener("click", async () => {
                const input = prompt(
                    `請輸入 ${alert.base}/${alert.quote} 的新目標匯率`,
                    alert.target_rate
                );

                if (input === null) return;

                const newRate = Number(input.trim());

                if (!Number.isFinite(newRate) || newRate <= 0) {
                    alertMessage.textContent =
                        "請輸入有效且大於 0 的匯率。";
                    return;
                }

                editButton.disabled = true;

                try {
                    await alertApi(
                        `/api/alerts/${encodeURIComponent(alert.id)}`,
                        {
                            method: "PUT",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                target_rate: input.trim()
                            })
                        }
                    );

                    alertMessage.textContent = "目標匯率修改成功！";
                    await loadAlerts();

                } catch (error) {
                    alertMessage.textContent =
                        `修改失敗：${error.message}`;
                    editButton.disabled = false;
                }
            });


            // 啟用 / 停用提醒
            const toggleButton = createAlertElement(
                "button",
                alert.enabled ? "停用提醒" : "啟用提醒",
                "btn btn-sm btn-outline-warning mt-3 me-2"
            );

            toggleButton.type = "button";

            toggleButton.addEventListener("click", async () => {
                toggleButton.disabled = true;

                try {
                    await alertApi(
                        `/api/alerts/${encodeURIComponent(alert.id)}`,
                        {
                            method: "PUT",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                enabled: !alert.enabled
                            })
                        }
                    );

                    alertMessage.textContent =
                        alert.enabled
                            ? "提醒已停用！"
                            : "提醒已啟用！";

                    await loadAlerts();

                } catch (error) {
                    alertMessage.textContent =
                        `更新狀態失敗：${error.message}`;
                    toggleButton.disabled = false;
                }
            });



            // 刪除提醒按鈕
            const deleteButton = createAlertElement(
                "button",
                "刪除提醒",
                "btn btn-sm btn-outline-danger mt-3"
            );

            deleteButton.type = "button";

            deleteButton.addEventListener("click", async () => {
                const confirmed = confirm(
                    `確定要刪除 ${alert.base}/${alert.quote} 的提醒嗎？`
                );

                if (!confirmed) return;

                deleteButton.disabled = true;

                try {
                    await alertApi(
                        `/api/alerts/${encodeURIComponent(alert.id)}`,
                        { method: "DELETE" }
                    );

                    alertMessage.textContent = "提醒刪除成功！";
                    await loadAlerts();

                } catch (error) {
                    alertMessage.textContent =
                        `刪除失敗：${error.message}`;

                    deleteButton.disabled = false;
                }
            });

            const actionButtons = document.createElement("div");
            actionButtons.className = "d-flex flex-wrap gap-2 mt-3";

            actionButtons.append(
                editButton,
                toggleButton,
                deleteButton
            );

            card.append(
                title,
                target,
                status,
                condition,
                actionButtons
            );

            alertList.appendChild(card);
        });

    } catch (error) {
        alertList.textContent =
            `讀取提醒失敗：${error.message}`;
    }
}


// 2. 新增匯率提醒
async function createAlert(event) {
    event.preventDefault();

    const base = document.getElementById("alertBase").value;
    const quote = document.getElementById("alertQuote").value;
    const operator = document.getElementById("alertOperator").value;
    const targetRate = document.getElementById("alertTarget").value;

    if (base === quote) {
        alertMessage.textContent = "來源貨幣和目標貨幣不能相同。";
        return;
    }

    if (!targetRate || Number(targetRate) <= 0 ||
        !Number.isFinite(Number(targetRate))) {
        alertMessage.textContent = "請輸入有效且大於 0 的目標匯率。";
        return;
    }

    const button = alertForm.querySelector('button[type="submit"]');
    button.disabled = true;
    alertMessage.textContent = "正在新增提醒...";

    try {
        await alertApi("/api/alerts", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                base: base,
                quote: quote,
                operator: operator,
                target_rate: targetRate,
                enabled: true
            })
        });

        alertMessage.textContent = "提醒新增成功！";

        document.getElementById("alertTarget").value = "";

        // 新增成功後更新清單
        await loadAlerts();

    } catch (error) {
        alertMessage.textContent =
            `新增失敗：${error.message}`;
    } finally {
        button.disabled = false;
    }
}


// 3. 手動檢查所有提醒
async function checkAlerts() {
    const button = document.getElementById("checkAlertsBtn");

    button.disabled = true;
    alertCheckResult.textContent = "正在檢查匯率...";

    try {
        const data = await alertApi("/api/alerts/check", {
            method: "POST"
        });

        alertCheckResult.textContent =
            `成功檢查 ${data.checked_count} 筆提醒，` +
            `本次新觸發 ${data.triggered_count} 筆。` +
            (data.errors.length > 0
                ? ` 有 ${data.errors.length} 組貨幣查詢失敗。`
                : "");

        // 更新提醒的達標狀態
        await loadAlerts();

    } catch (error) {
        alertCheckResult.textContent =
            `檢查失敗：${error.message}`;
    } finally {
        button.disabled = false;
    }
}


// 4. 綁定按鈕事件
if (alertForm && alertList) {
    alertForm.addEventListener("submit", createAlert);

    document.getElementById("refreshAlertsBtn")
        .addEventListener("click", loadAlerts);

    document.getElementById("checkAlertsBtn")
        .addEventListener("click", checkAlerts);

    // 網頁開啟時自動讀取提醒
    loadAlerts();
}