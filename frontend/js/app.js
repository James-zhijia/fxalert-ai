
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