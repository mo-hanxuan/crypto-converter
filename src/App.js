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

// 添加加密货币ID映射
const cryptoIdMap = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  XRP: 'ripple',
  USDT: 'tether',
  USDC: 'usd-coin',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  LTC: 'litecoin'
};

// 在axios请求中添加延迟
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const App = () => {
  const [amount, setAmount] = useState('1');
  const [fromCurrency, setFromCurrency] = useState('BTC');
  const [toCurrency, setToCurrency] = useState('USD');
  const [result, setResult] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [error, setError] = useState(null);

  const YOUR_API_KEY = 'de1ce2113ab0865f00954d0a';

  const cryptoCurrencies = ['BTC', 'ETH', 'USDT'];
  const fiatCurrencies = ['USD', 'EUR', 'GBP', 'CNY', 'JPY'];

  const convertCurrency = async () => {
    try {
      setError(null);
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
    }
  };

  const convertCryptoToFiat = async () => {
    await delay(1000); // 添加1秒延迟避免触发API限流
    try {
      const cryptoId = cryptoIdMap[fromCurrency];
      const vsCurrency = toCurrency.toLowerCase();
      
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=${vsCurrency}`
      );
  
      // 添加数据存在性检查
      if (!response.data[cryptoId] || !response.data[cryptoId][vsCurrency]) {
        throw new Error('无法获取汇率数据');
      }
  
      return amount * response.data[cryptoId][vsCurrency];
    } catch (err) {
      throw new Error(`加密货币转换失败: ${err.message}`);
    }
  };

  const convertFiatToCrypto = async () => {
    await delay(1000); // 添加1秒延迟避免触发API限流
    try {
      const cryptoId = cryptoIdMap[toCurrency];
      const vsCurrency = fromCurrency.toLowerCase();
      
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=${vsCurrency}`
      );
  
      if (!response.data[cryptoId] || !response.data[cryptoId][vsCurrency]) {
        throw new Error('无法获取汇率数据');
      }
  
      return amount / response.data[cryptoId][vsCurrency];
    } catch (err) {
      throw new Error(`法币转加密货币失败: ${err.message}`);
    }
  };

  const convertCryptoToCrypto = async () => {
    try {
      // 获取原始加密货币的美元价格
      const fromResponse = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIdMap[fromCurrency]}&vs_currencies=usd`
      );
      const fromPriceUSD = fromResponse.data[cryptoIdMap[fromCurrency]].usd;
      
      // 获取目标加密货币的美元价格
      const toResponse = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIdMap[toCurrency]}&vs_currencies=usd`
      );
      const toPriceUSD = toResponse.data[cryptoIdMap[toCurrency]].usd;
      
      // 计算交叉汇率：1 FROM = (FROM_USD / TO_USD) TO
      const conversionRate = fromPriceUSD / toPriceUSD;
      return amount * conversionRate;
      
    } catch (err) {
      throw new Error(`加密货币转换失败: ${err.message}`);
    }
  };

  const convertFiatToFiat = async () => {
    const response = await axios.get(
      `https://api.exchangerate-api.com/v6/YOUR_API_KEY/pair/${fromCurrency}/${toCurrency}/${amount}`
    );
    return response.data.conversion_result;
  };

  const fetchHistoricalData = async () => {
    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${fromCurrency.toLowerCase()}/market_chart?vs_currency=${toCurrency.toLowerCase()}&days=30`
      );
      setHistoricalData(response.data.prices.map(([timestamp, price]) => ({
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
  }, [fromCurrency, toCurrency]);

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

        <button className="button" onClick={convertCurrency}>
          立即转换
        </button>
      </div>

      {error && <div className="error-message">❌ {error}</div>}

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
          <h2 className="chart-title">最近30天价格走势</h2>
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