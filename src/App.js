import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import './App.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// API配置
const API_CONFIG = {
  coingecko: 'https://api.coingecko.com/api/v3',
  coinpaprika: 'https://api.coinpaprika.com/v1',
  cryptowatch: 'https://api.cryptowat.ch'
};

// 加密货币ID映射
const cryptoIdMap = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether'
};

// 创建带缓存的axios实例
const apiClient = axios.create({
  timeout: 10000,
});

// 请求缓存
const cache = new Map();
let lastRequestTime = 0;

// 请求拦截器（限流）
apiClient.interceptors.request.use(async (config) => {
  const now = Date.now();
  if (now - lastRequestTime < 1500) {
    await new Promise(resolve => 
      setTimeout(resolve, 1500 - (now - lastRequestTime))
    );
  }
  lastRequestTime = now;
  
  // 检查缓存
  const cacheKey = JSON.stringify(config);
  if (cache.has(cacheKey)) {
    const { expire, data } = cache.get(cacheKey);
    if (Date.now() < expire) {
      return { ...config, data };
    }
  }
  
  return config;
});

// 响应拦截器（缓存）
apiClient.interceptors.response.use((response) => {
  const cacheKey = JSON.stringify(response.config);
  cache.set(cacheKey, {
    data: response.data,
    expire: Date.now() + 60000 // 缓存1分钟
  });
  return response;
});

const App = () => {
  const [amount, setAmount] = useState('1');
  const [fromCurrency, setFromCurrency] = useState('BTC');
  const [toCurrency, setToCurrency] = useState('USD');
  const [result, setResult] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('30'); // 新增时间范围状态
  const timeOptions = [
    { label: '一年', value: '365' },
    { label: '三个月', value: '90' },
    { label: '30天', value: '30' },
    { label: '5天', value: '5' }
  ];

  const cryptoCurrencies = ['BTC', 'ETH', 'USDT'];
  const fiatCurrencies = ['USD', 'EUR', 'GBP', 'CNY', 'JPY'];

  const checkNetwork = async () => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = 'https://www.google.com/favicon.ico?' + Date.now();
      img.onload = resolve;
      img.onerror = () => reject(new Error('网络连接不可用'));
    });
  };

  const tryAPIs = async (urlPath) => {
    const apis = [
      `${API_CONFIG.coingecko}${urlPath}`,
      `${API_CONFIG.coinpaprika}/tickers${urlPath}`,
      `${API_CONFIG.cryptowat}/markets${urlPath}`
    ];

    for (const url of apis) {
      try {
        const response = await apiClient.get(url);
        return response.data;
      } catch (err) {
        console.warn(`API请求失败: ${url}`, err.message);
      }
    }
    throw new Error('所有API源均不可用');
  };

  const convertCryptoToFiat = async () => {
    await checkNetwork();
    const cryptoId = cryptoIdMap[fromCurrency];
    const vsCurrency = toCurrency.toLowerCase();
    
    const data = await tryAPIs(`/simple/price?ids=${cryptoId}&vs_currencies=${vsCurrency}`);
    if (!data[cryptoId]?.[vsCurrency]) {
      throw new Error('无法获取加密货币汇率');
    }
    return amount * data[cryptoId][vsCurrency];
  };

  const convertFiatToCrypto = async () => {
    await checkNetwork();
    const cryptoId = cryptoIdMap[toCurrency];
    const vsCurrency = fromCurrency.toLowerCase();
    
    const data = await tryAPIs(`/simple/price?ids=${cryptoId}&vs_currencies=${vsCurrency}`);
    if (!data[cryptoId]?.[vsCurrency]) {
      throw new Error('无法获取法币汇率');
    }
    return amount / data[cryptoId][vsCurrency];
  };

  const convertCryptoToCrypto = async () => {
    await checkNetwork();
    const [fromData, toData] = await Promise.all([
      tryAPIs(`/simple/price?ids=${cryptoIdMap[fromCurrency]}&vs_currencies=usd`),
      tryAPIs(`/simple/price?ids=${cryptoIdMap[toCurrency]}&vs_currencies=usd`)
    ]);

    const fromPrice = fromData[cryptoIdMap[fromCurrency]]?.usd;
    const toPrice = toData[cryptoIdMap[toCurrency]]?.usd;
    
    if (!fromPrice || !toPrice) {
      throw new Error('无法获取双币种汇率');
    }
    return amount * (fromPrice / toPrice);
  };

  const convertFiatToFiat = async () => {
    await checkNetwork();
    const data = await tryAPIs(`/pair/${fromCurrency}/${toCurrency}/${amount}`);
    return data.conversion_result;
  };

  const convertCurrency = async () => {
    try {
      setError(null);
      setResult(null);
      setIsLoading(true);
      
      if (!amount || isNaN(amount)) {
        throw new Error('请输入有效的金额');
      }

      let conversionResult;
      const isFromCrypto = cryptoCurrencies.includes(fromCurrency);
      const isToCrypto = cryptoCurrencies.includes(toCurrency);

      if (isFromCrypto && isToCrypto) {
        conversionResult = await convertCryptoToCrypto();
      } else if (isFromCrypto) {
        conversionResult = await convertCryptoToFiat();
      } else if (isToCrypto) {
        conversionResult = await convertFiatToCrypto();
      } else {
        conversionResult = await convertFiatToFiat();
      }

      setResult(conversionResult.toFixed(isToCrypto ? 8 : 2));
      
    } catch (err) {
      console.error('转换错误:', err);
      setError(err.message);
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 或许汇率变化的历史数据
  const fetchHistoricalData = async () => {
    try {
      const data = await tryAPIs(`/coins/${cryptoIdMap[fromCurrency]}/market_chart?vs_currency=${toCurrency.toLowerCase()}&days=${timeRange}`);
      setHistoricalData(data.prices.map(([timestamp, price]) => ({
        date: new Date(timestamp).toLocaleDateString(),
        price: price
      })));
    } catch (err) {
      console.error('获取历史数据失败:', err);
    }
  };

  useEffect(() => {
    if (cryptoCurrencies.includes(fromCurrency) || cryptoCurrencies.includes(toCurrency)) {
      fetchHistoricalData();
    }
  }, [fromCurrency, toCurrency, timeRange]); // 添加timeRange依赖

  const renderCurrencyOptions = (currencies, label) => (
    <optgroup label={label}>
      {currencies.map(currency => (
        <option key={currency} value={currency}>
          {currency}
        </option>
      ))}
    </optgroup>
  );

  return (
    <div className="container">
      <h1 className="title">数字资产转换器</h1>

      <div className="input-container">
        <input
          className="input"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="输入金额"
          min="0"
        />

        <select
          className="input"
          value={fromCurrency}
          onChange={(e) => setFromCurrency(e.target.value)}
        >
          {renderCurrencyOptions(fiatCurrencies, '法定货币')}
          {renderCurrencyOptions(cryptoCurrencies, '加密货币')}
        </select>

        <span className="conversion-arrow">→</span>

        <select
          className="input"
          value={toCurrency}
          onChange={(e) => setToCurrency(e.target.value)}
        >
          {renderCurrencyOptions(fiatCurrencies, '法定货币')}
          {renderCurrencyOptions(cryptoCurrencies, '加密货币')}
        </select>

        <button 
          className="button" 
          onClick={convertCurrency}
          disabled={isLoading}
        >
          {isLoading ? '转换中...' : '立即转换'}
        </button>
      </div>

      {error && <div className="error-message">❌ {error}</div>}

      {isLoading && (
        <div className="loader-container">
          <div className="loader"></div>
        </div>
      )}

      {result !== null && (
        <div className="result-box">
          <h3>转换结果：</h3>
          <p>
            {amount} {fromCurrency} = 
            <span className="result-number"> {result} </span>
            {toCurrency}
          </p>
        </div>
      )}

      {historicalData.length > 0 && (
        <div className="chart-container">
          <div className="time-range-selector">
            <h2 className="chart-title">
              最近{timeOptions.find(opt => opt.value === timeRange)?.label}价格走势
            </h2>
            <select
              className="time-select"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              {timeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Line
            data={{
              labels: historicalData.map(item => item.date),
              datasets: [{
                label: `${fromCurrency} 价格走势`,
                data: historicalData.map(item => item.price),
                borderColor: '#007AFF',
                tension: 0.2
              }]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false
            }}
          />
        </div>
      )}
    </div>
  );
};

export default App;