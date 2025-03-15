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
  cryptowatch: 'https://api.cryptowat.ch',
  coinlore: 'https://api.coinlore.net/api',
  binance: 'https://api.binance.com/api/v3',
  kucoin: 'https://api.kucoin.com',
  kraken: 'https://api.kraken.com/0/public'
};

// 加密货币ID映射 (针对不同API)
const cryptoMappings = {
  coingecko: {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    USDT: 'tether',
    LTC: 'litecoin',
    DOGE: 'dogecoin',
    TRUMP: 'official-trump'
  },
  coinpaprika: {
    BTC: 'btc-bitcoin',
    ETH: 'eth-ethereum',
    USDT: 'usdt-tether',
    LTC: 'ltc-litecoin',
    DOGE: 'doge-dogecoin',
    TRUMP: 'trump-trump-token'
  },
  coinlore: {
    BTC: '90',
    ETH: '80',
    USDT: '518',
    LTC: '1',
    DOGE: '2'
  },
  binance: {
    BTC: 'BTC',
    ETH: 'ETH',
    USDT: 'USDT',
    LTC: 'LTC',
    DOGE: 'DOGE'
  }
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
  const [isChartLoading, setIsChartLoading] = useState(false); // 新增图表加载状态
  const [timeRange, setTimeRange] = useState('30'); // 新增时间范围状态
  const timeOptions = [
    { label: '一年', value: '365' },
    { label: '三个月', value: '90' },
    { label: '30天', value: '30' },
    { label: '5天', value: '5' }
  ];

  const cryptoCurrencies = ['BTC', 'ETH', 'USDT', 'LTC', 'DOGE', 'TRUMP'];
  const fiatCurrencies = ['USD', 'EUR', 'GBP', 'CNY', 'JPY'];

  // 辅助函数：按天对价格数据进行分组
  const groupByDay = (pricesArray) => {
    const result = new Map();
    
    for (const [timestamp, price] of pricesArray) {
      // 获取日期字符串 (YYYY-MM-DD 格式)
      const date = new Date(timestamp);
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
      // 如果这一天已经有数据，取平均值
      if (result.has(day)) {
        const [sum, count] = result.get(day);
        result.set(day, [sum + price, count + 1]);
      } else {
        result.set(day, [price, 1]);
      }
    }
    
    // 计算每天的平均价格
    const dailyPrices = new Map();
    for (const [day, [sum, count]] of result.entries()) {
      dailyPrices.set(day, sum / count);
    }
    
    return dailyPrices;
  };

  const checkNetwork = async () => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = 'https://www.google.com/favicon.ico?' + Date.now();
      img.onload = resolve;
      img.onerror = () => reject(new Error('网络连接不可用'));
    });
  };

  // 适配不同API源的请求格式
  const formatApiUrl = (apiName, params) => {
    const { endpoint, fromCrypto, toCrypto, fiat, timeRange } = params;
    
    switch (apiName) {
      case 'coingecko':
        switch (endpoint) {
          case 'price':
            return `${API_CONFIG.coingecko}/simple/price?ids=${fromCrypto}&vs_currencies=${fiat}`;
          case 'market_chart':
            return `${API_CONFIG.coingecko}/coins/${fromCrypto}/market_chart?vs_currency=${fiat}&days=${timeRange}`;
          default:
            return null;
        }
      
      case 'coinpaprika':
        switch (endpoint) {
          case 'price':
            return `${API_CONFIG.coinpaprika}/tickers/${fromCrypto}?quotes=${fiat}`;
          case 'market_chart':
            return `${API_CONFIG.coinpaprika}/tickers/${fromCrypto}/historical?start=${getDateBeforeDays(timeRange)}&interval=1d`;
          default:
            return null;
        }
      
      case 'coinlore':
        switch (endpoint) {
          case 'price':
            return `${API_CONFIG.coinlore}/ticker/?id=${fromCrypto}`;
          case 'market_chart':
            return `${API_CONFIG.coinlore}/coin/markets/?id=${fromCrypto}`;
          default:
            return null;
        }
      
      case 'binance':
        switch (endpoint) {
          case 'price':
            const symbol = fiat === 'usd' ? `${fromCrypto}USDT` : `${fromCrypto}${fiat.toUpperCase()}`;
            return `${API_CONFIG.binance}/ticker/price?symbol=${symbol}`;
          case 'market_chart':
            const klines = fiat === 'usd' ? `${fromCrypto}USDT` : `${fromCrypto}${fiat.toUpperCase()}`;
            const interval = timeRange <= 7 ? '1h' : '1d';
            return `${API_CONFIG.binance}/klines?symbol=${klines}&interval=${interval}&limit=${timeRange}`;
          default:
            return null;
        }
        
      default:
        return null;
    }
  };

  // 获取日期（当前日期减去天数）
  const getDateBeforeDays = (days) => {
    const date = new Date();
    date.setDate(date.getDate() - parseInt(days));
    return date.toISOString().split('T')[0];
  };

  // 尝试所有API源
  const tryAPIs = async (params) => {
    const apiSources = ['coingecko', 'coinpaprika', 'coinlore', 'binance'];
    const errors = [];
    
    for (const apiName of apiSources) {
      try {
        const url = formatApiUrl(apiName, params);
        if (!url) continue;
        
        const response = await apiClient.get(url);
        
        // 标准化不同API的响应格式
        return normalizeApiResponse(apiName, params.endpoint, response.data);
      } catch (err) {
        console.warn(`API请求失败: ${apiName}`, err.message);
        errors.push(`${apiName}: ${err.message}`);
      }
    }
    
    throw new Error(`所有API源均不可用: ${errors.join('; ')}`);
  };

  // 标准化不同API源的响应格式
  const normalizeApiResponse = (apiName, endpoint, data) => {
    switch (apiName) {
      case 'coingecko':
        return data; // CoinGecko格式作为标准格式
        
      case 'coinpaprika':
        if (endpoint === 'price') {
          const currency = Object.keys(data.quotes)[0].toLowerCase();
          return {
            [data.id]: { 
              [currency]: data.quotes[Object.keys(data.quotes)[0]].price
            }
          };
        } else if (endpoint === 'market_chart') {
          return {
            prices: data.map(item => [
              new Date(item.timestamp).getTime(),
              item.price
            ])
          };
        }
        break;
        
      case 'coinlore':
        if (endpoint === 'price') {
          return {
            [cryptoMappings.coinlore[data[0].symbol]]: {
              usd: parseFloat(data[0].price_usd)
            }
          };
        } else if (endpoint === 'market_chart') {
          // 假设能获取历史数据
          return {
            prices: data.map(item => [
              new Date(item.date).getTime(),
              parseFloat(item.price_usd)
            ])
          };
        }
        break;
        
      case 'binance':
        if (endpoint === 'price') {
          const symbol = data.symbol;
          const crypto = symbol.substring(0, symbol.length - 4);
          const currency = symbol.substring(symbol.length - 4).toLowerCase();
          return {
            [cryptoMappings.binance[crypto]]: {
              [currency]: parseFloat(data.price)
            }
          };
        } else if (endpoint === 'market_chart') {
          return {
            prices: data.map(item => [
              item[0], // 时间戳
              parseFloat(item[4]) // 收盘价
            ])
          };
        }
        break;
        
      default:
        return data;
    }
    
    return data;
  };

  const convertCryptoToFiat = async () => {
    await checkNetwork();
    const cryptoId = cryptoMappings.coingecko[fromCurrency];
    const vsCurrency = toCurrency.toLowerCase();
    
    const data = await tryAPIs({ endpoint: 'price', fromCrypto: cryptoId, fiat: vsCurrency });
    if (!data[cryptoId]?.[vsCurrency]) {
      throw new Error('无法获取加密货币汇率');
    }
    return amount * data[cryptoId][vsCurrency];
  };

  const convertFiatToCrypto = async () => {
    await checkNetwork();
    const cryptoId = cryptoMappings.coingecko[toCurrency];
    const vsCurrency = fromCurrency.toLowerCase();
    
    const data = await tryAPIs({ endpoint: 'price', fromCrypto: cryptoId, fiat: vsCurrency });
    if (!data[cryptoId]?.[vsCurrency]) {
      throw new Error('无法获取法币汇率');
    }
    return amount / data[cryptoId][vsCurrency];
  };

  const convertCryptoToCrypto = async () => {
    await checkNetwork();
    const [fromData, toData] = await Promise.all([
      tryAPIs({ endpoint: 'price', fromCrypto: cryptoMappings.coingecko[fromCurrency], fiat: 'usd' }),
      tryAPIs({ endpoint: 'price', fromCrypto: cryptoMappings.coingecko[toCurrency], fiat: 'usd' })
    ]);

    const fromPrice = fromData[cryptoMappings.coingecko[fromCurrency]]?.usd;
    const toPrice = toData[cryptoMappings.coingecko[toCurrency]]?.usd;
    
    if (!fromPrice || !toPrice) {
      throw new Error('无法获取双币种汇率');
    }
    return amount * (fromPrice / toPrice);
  };

  const convertFiatToFiat = async () => {
    await checkNetwork();
    
    try {
      // 尝试使用汇率API进行法币转换
      // 这里使用免费的 ExchangeRate-API
      const response = await apiClient.get(`https://open.er-api.com/v6/latest/${fromCurrency}`);
      const rate = response.data.rates[toCurrency];
      
      if (!rate) {
        throw new Error('无法获取汇率数据');
      }
      
      return amount * rate;
    } catch (err) {
      console.warn('ExchangeRate-API请求失败，尝试备用API', err.message);
      
      // 备用API: 使用CoinGecko做中间转换 (通过BTC)
      try {
        const [btcFrom, btcTo] = await Promise.all([
          tryAPIs({ endpoint: 'price', fromCrypto: cryptoMappings.coingecko.BTC, fiat: fromCurrency.toLowerCase() }),
          tryAPIs({ endpoint: 'price', fromCrypto: cryptoMappings.coingecko.BTC, fiat: toCurrency.toLowerCase() })
        ]);
        
        // 从货币1兑换到BTC，再从BTC兑换到货币2
        const fromRate = btcFrom[cryptoMappings.coingecko.BTC][fromCurrency.toLowerCase()];
        const toRate = btcTo[cryptoMappings.coingecko.BTC][toCurrency.toLowerCase()];
        
        if (!fromRate || !toRate) {
          throw new Error('无法获取法币汇率');
        }
        
        // 计算汇率：1/fromRate * toRate
        return amount * (toRate / fromRate);
      } catch (secondErr) {
        throw new Error(`法币转换失败: ${secondErr.message}`);
      }
    }
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
      
      // 在转换完成后，尝试获取历史数据
      // 只要有一种货币是加密货币，就尝试获取历史数据
      try {
        if (isFromCrypto || isToCrypto) {
          await fetchHistoricalData();
        } else {
          // 即使是法币对法币，也可以尝试获取汇率历史
          const today = new Date();
          const historicalFiatData = [];
          
          try {
            // 通过外部API获取历史法币汇率(示例，可能需要替换为实际可用的API)
            const startDate = new Date();
            startDate.setDate(today.getDate() - parseInt(timeRange));
            
            // 使用Exchange Rates API获取历史汇率
            const response = await fetch(
              `https://api.exchangerate.host/timeseries?start_date=${startDate.toISOString().split('T')[0]}&end_date=${today.toISOString().split('T')[0]}&base=${fromCurrency}&symbols=${toCurrency}`
            );
            
            if (response.ok) {
              const data = await response.json();
              
              // 转换为与加密货币相同的格式
              for (const [dateStr, rates] of Object.entries(data.rates)) {
                historicalFiatData.push({
                  date: new Date(dateStr).toLocaleDateString(),
                  price: rates[toCurrency]
                });
              }
              
              setHistoricalData(historicalFiatData);
            }
          } catch (historyErr) {
            console.warn('获取法币历史数据失败', historyErr);
            // 法币历史获取失败不影响主要功能，忽略错误
          }
        }
      } catch (historyErr) {
        // 历史数据获取失败不影响主要功能
        console.warn('获取历史数据失败，但不影响转换结果', historyErr);
      }
    } catch (err) {
      console.error('转换错误:', err);
      setError(err.message);
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 获取汇率变化的历史数据
  const fetchHistoricalData = async () => {
    try {
      setIsChartLoading(true); // 开始加载图表数据
      setError(null); // 清除之前的错误
      const isFromCrypto = cryptoCurrencies.includes(fromCurrency);
      const isToCrypto = cryptoCurrencies.includes(toCurrency);

      console.log(`开始获取历史数据: ${fromCurrency} 到 ${toCurrency}, 时间范围: ${timeRange}天`);

      // 如果是加密货币到加密货币的转换
      if (isFromCrypto && isToCrypto) {
        console.log('加密货币到加密货币的转换，通过USD作为中介');
        
        // 获取两种加密货币对美元的历史汇率
        let fromData, toData;
        try {
          [fromData, toData] = await Promise.all([
            tryAPIs({ endpoint: 'market_chart', fromCrypto: cryptoMappings.coingecko[fromCurrency], fiat: 'usd', timeRange }),
            tryAPIs({ endpoint: 'market_chart', fromCrypto: cryptoMappings.coingecko[toCurrency], fiat: 'usd', timeRange })
          ]);
          
          console.log(`成功获取 ${fromCurrency} 数据点: ${fromData.prices.length}个`);
          console.log(`成功获取 ${toCurrency} 数据点: ${toData.prices.length}个`);
        } catch (err) {
          console.error('获取历史汇率数据失败:', err);
          throw new Error(`获取历史汇率数据失败: ${err.message}`);
        }

        // 确保两个数据集有相同的时间点 (使用更灵活的匹配方式)
        const combinedData = [];
        
        // 1. 为了处理不同API返回的时间戳可能略有不同的问题
        // 将时间戳按小时四舍五入处理，这样即使相差几分钟的数据点也能匹配上
        const fromPrices = new Map();
        const toPrices = new Map();
        
        // 将时间戳按小时取整，避免毫秒级的差异
        for (const [timestamp, price] of fromData.prices) {
          // 按小时取整的时间戳 (向下取整到小时)
          const roundedTimestamp = Math.floor(timestamp / 3600000) * 3600000;
          fromPrices.set(roundedTimestamp, price);
        }
        
        for (const [timestamp, price] of toData.prices) {
          // 按小时取整的时间戳 (向下取整到小时)
          const roundedTimestamp = Math.floor(timestamp / 3600000) * 3600000;
          toPrices.set(roundedTimestamp, price);
        }

        console.log(`处理后 ${fromCurrency} 数据点: ${fromPrices.size}个`);
        console.log(`处理后 ${toCurrency} 数据点: ${toPrices.size}个`);
        
        // 2. 使用 fromCurrency 的时间戳作为基准查找匹配的数据点
        for (const [timestamp, fromPrice] of fromPrices.entries()) {
          if (toPrices.has(timestamp)) {
            const toPrice = toPrices.get(timestamp);
            // 确保价格都是有效的非零值
            if (fromPrice > 0 && toPrice > 0) {
              combinedData.push({
                timestamp,
                date: new Date(timestamp).toLocaleDateString(),
                price: fromPrice / toPrice // 计算转换率
              });
            }
          }
        }
        
        // 3. 如果没有找到足够的匹配点，使用最接近的时间点
        if (combinedData.length < 5) {
          console.log("找到的匹配点不足，尝试使用最接近的时间点...");
          
          // 清空之前的结果
          combinedData.length = 0;
          
          // 对于每个fromCurrency的数据点，找到toCurrency中最接近的时间点
          const fromTimestamps = Array.from(fromPrices.keys()).sort((a, b) => a - b);
          const toTimestamps = Array.from(toPrices.keys()).sort((a, b) => a - b);
          
          for (const fromTimestamp of fromTimestamps) {
            // 找到最接近的时间点
            const closestToTimestamp = toTimestamps.reduce((closest, current) => {
              return Math.abs(current - fromTimestamp) < Math.abs(closest - fromTimestamp) ? current : closest;
            }, toTimestamps[0]);
            
            // 如果最接近的时间点在24小时以内，认为是有效的匹配
            if (Math.abs(closestToTimestamp - fromTimestamp) < 24 * 3600000) {
              const fromPrice = fromPrices.get(fromTimestamp);
              const toPrice = toPrices.get(closestToTimestamp);
              
              if (fromPrice > 0 && toPrice > 0) {
                combinedData.push({
                  timestamp: fromTimestamp,
                  date: new Date(fromTimestamp).toLocaleDateString(),
                  price: fromPrice / toPrice
                });
              }
            }
          }
        }
        
        // 4. 如果仍然没有足够的数据点，尝试用每日采样
        if (combinedData.length < 5) {
          console.log("尝试对原始数据进行每日采样...");
          
          // 按天对数据进行分组
          const fromByDay = groupByDay(fromData.prices);
          const toByDay = groupByDay(toData.prices);
          
          // 对每一天，如果两种货币都有数据，计算比率
          for (const [day, fromValue] of fromByDay.entries()) {
            if (toByDay.has(day)) {
              const toValue = toByDay.get(day);
              if (fromValue > 0 && toValue > 0) {
                // 使用当天的时间戳
                const timestamp = new Date(day).getTime();
                combinedData.push({
                  timestamp,
                  date: new Date(timestamp).toLocaleDateString(),
                  price: fromValue / toValue
                });
              }
            }
          }
        }

        console.log(`最终匹配数据点: ${combinedData.length}个`);
        
        // 至少需要2个点才能绘制图表
        if (combinedData.length < 2) {
          throw new Error('没有找到足够的匹配时间点，无法生成历史数据图表');
        }
        
        // 按时间排序
        combinedData.sort((a, b) => a.timestamp - b.timestamp);
        setHistoricalData(combinedData);
      } else {
        // 原有逻辑：直接获取一种货币对另一种的汇率
        console.log(`${isFromCrypto ? '加密货币到法币' : '法币到加密货币'}的转换`);
        
        const baseCurrency = isFromCrypto ? fromCurrency : toCurrency;
        const targetCurrency = isFromCrypto ? toCurrency.toLowerCase() : fromCurrency.toLowerCase();
        
        let data;
        try {
          // 尝试多个API源
          let attempts = 0;
          let success = false;
          
          // 尝试使用主要API
          try {
            data = await tryAPIs({ 
              endpoint: 'market_chart', 
              fromCrypto: cryptoMappings.coingecko[baseCurrency], 
              fiat: targetCurrency, 
              timeRange 
            });
            success = data && data.prices && data.prices.length > 0;
            console.log(`主要API数据获取${success ? '成功' : '失败'}`);
          } catch (mainErr) {
            console.warn('主要API获取失败:', mainErr.message);
          }
          
          // 如果主要API失败，尝试备用方法 - 通过USD作为媒介
          if (!success && !['usd', 'USD'].includes(targetCurrency)) {
            console.log('尝试通过USD作为媒介获取数据...');
            attempts++;
            
            try {
              // 先获取货币对USD的历史数据
              const usdData = await tryAPIs({ 
                endpoint: 'market_chart', 
                fromCrypto: cryptoMappings.coingecko[baseCurrency], 
                fiat: 'usd', 
                timeRange 
              });
              
              if (usdData && usdData.prices && usdData.prices.length > 0) {
                // 然后获取USD到目标货币的汇率
                // 这里假设USD到其他法币的汇率在短期内相对稳定，用当前汇率
                let fiatRate = 1; // 默认USD到USD的汇率是1
                
                if (targetCurrency !== 'usd') {
                  try {
                    // 尝试获取USD到目标法币的汇率
                    const response = await fetch(`https://open.er-api.com/v6/latest/USD`);
                    if (response.ok) {
                      const rateData = await response.json();
                      fiatRate = rateData.rates[targetCurrency.toUpperCase()];
                      console.log(`获取USD到${targetCurrency}汇率: ${fiatRate}`);
                    }
                  } catch (rateErr) {
                    console.warn('获取法币汇率失败，使用默认值1', rateErr);
                  }
                }
                
                // 转换所有价格
                data = {
                  prices: usdData.prices.map(([timestamp, price]) => [
                    timestamp,
                    price * fiatRate
                  ])
                };
                
                success = true;
                console.log('通过USD中介成功获取数据');
              }
            } catch (usdErr) {
              console.warn('通过USD媒介获取失败:', usdErr.message);
            }
          }
          
          // 如果还是失败，尝试使用CoinGecko API的备用端点
          if (!success) {
            console.log('尝试使用备用API端点...');
            attempts++;
            
            try {
              const backupUrl = `https://api.coingecko.com/api/v3/coins/${cryptoMappings.coingecko[baseCurrency]}/ohlc?vs_currency=${targetCurrency}&days=${timeRange}`;
              const response = await fetch(backupUrl);
              
              if (response.ok) {
                const ohlcData = await response.json();
                // ohlc数据格式: [timestamp, open, high, low, close]
                data = {
                  prices: ohlcData.map(item => [item[0], item[4]]) // 使用收盘价
                };
                success = data.prices.length > 0;
                console.log(`备用API获取${success ? '成功' : '失败'}`);
              }
            } catch (backupErr) {
              console.warn('备用API获取失败:', backupErr.message);
            }
          }
          
          if (!success) {
            throw new Error(`尝试了${attempts + 1}种方法，但无法获取历史数据`);
          }
          
          console.log(`成功获取数据点: ${data.prices.length}个`);
        } catch (err) {
          console.error('获取历史数据失败:', err);
          throw new Error(`获取历史数据失败: ${err.message}`);
        }
        
        // 如果是从法币到加密货币，需要取倒数
        const priceTransform = !isFromCrypto && isToCrypto 
          ? (price) => 1 / price 
          : (price) => price;
        
        const transformedData = data.prices.map(([timestamp, price]) => ({
          date: new Date(timestamp).toLocaleDateString(),
          price: priceTransform(price)
        }));
        
        console.log(`转换后数据点: ${transformedData.length}个`);
        
        if (transformedData.length === 0) {
          throw new Error('历史数据为空，无法生成图表');
        }
        
        setHistoricalData(transformedData);
      }
    } catch (err) {
      console.error('获取历史数据总体失败:', err);
      setError('获取历史数据失败: ' + err.message);
      setHistoricalData([]); // 清空历史数据，避免显示旧数据
    } finally {
      setIsChartLoading(false); // 完成图表数据加载
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

      {error && (
        <div className="no-data-message error">
          <p>
            <i className="warning-icon">⚠️</i>
            {error}
          </p>
          <p className="subtext">您可以尝试:</p>
          <ul>
            <li>选择其他的时间范围（如选择更短的时间段）</li>
            <li>选择其他的加密货币组合</li>
            <li>检查您的网络连接</li>
            <li>稍后再试，API服务可能暂时不可用</li>
          </ul>
          <button 
            className="retry-button"
            onClick={() => {
              setError(null);
              fetchHistoricalData();
            }}
          >
            重新获取数据
          </button>
        </div>
      )}

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

      {/* 历史数据图表或提示 */}
      {isChartLoading ? (
        <div className="chart-container">
          <div className="time-range-selector">
            <h2 className="chart-title">
              正在加载历史数据...
            </h2>
          </div>
          <div className="chart-loader-container">
            <div className="loader"></div>
            <p>正在加载最新历史数据...</p>
          </div>
        </div>
      ) : historicalData.length > 0 ? (
        <div className="chart-container">
          <div className="time-range-selector">
            <h2 className="chart-title">
              最近{timeOptions.find(opt => opt.value === timeRange)?.label}价格走势
            </h2>
            <select
              className="time-select"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              disabled={isChartLoading}
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
                label: cryptoCurrencies.includes(fromCurrency) && cryptoCurrencies.includes(toCurrency)
                  ? `${amount} ${fromCurrency} 兑换 ${toCurrency} 汇率变化` 
                  : `${fromCurrency} 到 ${toCurrency} 价格走势`,
                data: historicalData.map(item => item.price),
                borderColor: '#007AFF',
                tension: 0.2
              }]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                tooltip: {
                  callbacks: {
                    label: function(context) {
                      const value = context.raw;
                      return cryptoCurrencies.includes(toCurrency)
                        ? `${value.toFixed(8)} ${toCurrency}`
                        : `${value.toFixed(2)} ${toCurrency}`;
                    }
                  }
                }
              }
            }}
          />
        </div>
      ) : cryptoCurrencies.includes(fromCurrency) || cryptoCurrencies.includes(toCurrency) ? (
        <div className="no-data-message">
          <p>
            <i className="info-icon">ℹ️</i>
            点击"立即转换"按钮获取{fromCurrency}到{toCurrency}的历史价格走势
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default App;