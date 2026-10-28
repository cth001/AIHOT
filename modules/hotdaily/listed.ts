// The listed companies the issue's market analysis may name. The model picks from this list only; a ticker
// that is not here is dropped, so the analysis never invents a company or a code. Edit it to follow the
// companies your readers care about; `names` are what the news may call them.
export interface ListedCompany {
  ticker: string;
  exchange: "NASDAQ" | "NYSE" | "HKEX" | "SSE" | "SZSE" | "Euronext";
  name: string;
  names: string[];
}

export const LISTED_COMPANIES: ListedCompany[] = [
  // US
  { ticker: "NVDA", exchange: "NASDAQ", name: "英伟达", names: ["NVIDIA", "英伟达"] },
  { ticker: "MSFT", exchange: "NASDAQ", name: "微软", names: ["Microsoft", "微软", "Azure", "Copilot"] },
  { ticker: "GOOGL", exchange: "NASDAQ", name: "谷歌（Alphabet）", names: ["Google", "Alphabet", "谷歌", "DeepMind", "Gemini"] },
  { ticker: "META", exchange: "NASDAQ", name: "Meta", names: ["Meta", "Llama"] },
  { ticker: "AMZN", exchange: "NASDAQ", name: "亚马逊", names: ["Amazon", "AWS", "亚马逊"] },
  { ticker: "AAPL", exchange: "NASDAQ", name: "苹果", names: ["Apple", "苹果"] },
  { ticker: "AMD", exchange: "NASDAQ", name: "AMD", names: ["AMD", "超威"] },
  { ticker: "AVGO", exchange: "NASDAQ", name: "博通", names: ["Broadcom", "博通"] },
  { ticker: "INTC", exchange: "NASDAQ", name: "英特尔", names: ["Intel", "英特尔"] },
  { ticker: "MU", exchange: "NASDAQ", name: "美光", names: ["Micron", "美光"] },
  { ticker: "ARM", exchange: "NASDAQ", name: "Arm", names: ["Arm"] },
  { ticker: "ASML", exchange: "NASDAQ", name: "阿斯麦", names: ["ASML", "阿斯麦"] },
  { ticker: "TSM", exchange: "NYSE", name: "台积电", names: ["TSMC", "台积电"] },
  { ticker: "ORCL", exchange: "NYSE", name: "甲骨文", names: ["Oracle", "甲骨文"] },
  { ticker: "CRM", exchange: "NYSE", name: "Salesforce", names: ["Salesforce"] },
  { ticker: "ADBE", exchange: "NASDAQ", name: "Adobe", names: ["Adobe"] },
  { ticker: "PLTR", exchange: "NASDAQ", name: "Palantir", names: ["Palantir"] },
  { ticker: "SMCI", exchange: "NASDAQ", name: "超微电脑", names: ["Supermicro", "Super Micro", "超微电脑"] },
  { ticker: "IBM", exchange: "NYSE", name: "IBM", names: ["IBM"] },
  { ticker: "TSLA", exchange: "NASDAQ", name: "特斯拉", names: ["Tesla", "特斯拉", "xAI"] },
  { ticker: "CRWV", exchange: "NASDAQ", name: "CoreWeave", names: ["CoreWeave"] },
  // Hong Kong
  { ticker: "0700.HK", exchange: "HKEX", name: "腾讯控股", names: ["Tencent", "腾讯", "混元"] },
  { ticker: "9988.HK", exchange: "HKEX", name: "阿里巴巴", names: ["Alibaba", "阿里巴巴", "阿里云", "通义", "Qwen"] },
  { ticker: "9888.HK", exchange: "HKEX", name: "百度", names: ["Baidu", "百度", "文心"] },
  { ticker: "1810.HK", exchange: "HKEX", name: "小米集团", names: ["Xiaomi", "小米", "MiMo"] },
  { ticker: "3690.HK", exchange: "HKEX", name: "美团", names: ["Meituan", "美团"] },
  { ticker: "1024.HK", exchange: "HKEX", name: "快手", names: ["Kuaishou", "快手", "可灵"] },
  { ticker: "0020.HK", exchange: "HKEX", name: "商汤", names: ["SenseTime", "商汤"] },
  // Mainland China
  { ticker: "688256.SH", exchange: "SSE", name: "寒武纪", names: ["寒武纪", "Cambricon"] },
  { ticker: "002230.SZ", exchange: "SZSE", name: "科大讯飞", names: ["科大讯飞", "iFlytek", "讯飞星火"] },
  { ticker: "688111.SH", exchange: "SSE", name: "金山办公", names: ["金山办公", "WPS"] },
  { ticker: "300308.SZ", exchange: "SZSE", name: "中际旭创", names: ["中际旭创"] },
  { ticker: "000977.SZ", exchange: "SZSE", name: "浪潮信息", names: ["浪潮信息", "浪潮"] },
  { ticker: "601138.SH", exchange: "SSE", name: "工业富联", names: ["工业富联", "富士康"] },
];
