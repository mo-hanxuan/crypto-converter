import React, { useState, useEffect } from 'react';
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

// 注册Chart.js组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const App = () => {
  // 状态管理
  const [amount, setAmount] = useState('1');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('EUR');
  const [result, setResult] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [error, setError] = useState(null);

  // 替换为你的实际API密钥
  const API_KEY = 'de1ce2113ab0865f00954d0a';

  // 当货币对变化时自动获取历史数据
  useEffect(() => {
    fetchHistoricalData();
  }, [fromCurrency, toCurrency]);

  // 货币转换函数
  const convertCurrency = async () => {
    try {
      setError(null); // 清除之前的错误
      
      // 输入验证
      if (!amount || isNaN(amount)) {
        throw new Error('请输入有效的金额');
      }

      // 发送转换请求
      const response = await fetch(
        `https://v6.exchangerate-api.com/v6/${API_KEY}/pair/${fromCurrency}/${toCurrency}/${amount}`
      );

      if (!response.ok) {
        throw new Error(`请求失败，状态码：${response.status}`);
      }

      const data = await response.json();
      
      if (data.result === 'error') {
        throw new Error(data['error-type']);
      }

      // 更新转换结果（保留两位小数）
      setResult(data.conversion_result.toFixed(2));
      
    } catch (err) {
      console.error('转换错误:', err);
      setError(err.message);
      setResult(null);
    }
  };

  // 获取历史数据函数
  const fetchHistoricalData = async () => {
    try {
      const response = await fetch(
        `https://v6.exchangerate-api.com/v6/${API_KEY}/history/${fromCurrency}/${toCurrency}/30`
      );
      
      const data = await response.json();
      
      if (data.result === 'success') {
        // 格式化历史数据为 { date: string, rate: number } 格式
        const formattedData = Object.entries(data.rates).map(([date, rate]) => ({
          date,
          rate: rate[toCurrency]
        }));
        setHistoricalData(formattedData);
      }
    } catch (err) {
      console.error('获取历史数据失败:', err);
    }
  };

  return (
    <div className="container">
      <h1 className="title">货币转换器</h1>

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
          <option value="USD">美元 (USD)</option>
          <option value="EUR">欧元 (EUR)</option>
          <option value="GBP">英镑 (GBP)</option>
          <option value="CNY">人民币 (CNY)</option>
          <option value="JPY">日元 (JPY)</option>
        </select>

        <span className="conversion-arrow">→</span>

        <select
          className="input"
          value={toCurrency}
          onChange={(e) => setToCurrency(e.target.value)}
        >
          <option value="EUR">欧元 (EUR)</option>
          <option value="USD">美元 (USD)</option>
          <option value="GBP">英镑 (GBP)</option>
          <option value="CNY">人民币 (CNY)</option>
          <option value="JPY">日元 (JPY)</option>
        </select>

        <button
          className="button"
          onClick={convertCurrency}
        >
          立即转换
        </button>
      </div>

      {/* 显示错误信息 */}
      {error && <div className="error-message">❌ {error}</div>}

      {/* 显示转换结果 */}
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

      {/* 显示历史图表 */}
      {historicalData.length > 0 && (
        <div className="chart-container">
          <h2 className="chart-title">最近30天汇率走势</h2>
          <Line
            data={{
              labels: historicalData.map(item => item.date),
              datasets: [{
                label: `${fromCurrency} 兑 ${toCurrency} 汇率`,
                data: historicalData.map(item => item.rate),
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