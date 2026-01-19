import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Stock } from '../types';
import { KRW } from './Formatters';

interface Props {
  stock: Stock;
}

const StockChart: React.FC<Props> = ({ stock }) => {
  const data = stock.priceHistory;
  const isUp = stock.currentPrice >= stock.previousClose;
  const color = isUp ? '#ef4444' : '#3b82f6';
  
  // Calculate Y Domain padding
  const minPrice = Math.min(...data.map(d => d.price));
  const maxPrice = Math.max(...data.map(d => d.price));
  const padding = (maxPrice - minPrice) * 0.1;

  return (
    <div className="w-full h-64 bg-cardbg rounded-lg p-2 border border-gray-800 relative">
      <div className="absolute top-2 left-4 z-10">
        <div className="text-xs text-gray-400">현재가</div>
        <div className={`text-2xl font-bold ${isUp ? 'text-up' : 'text-down'}`}>
            <KRW value={stock.currentPrice} />
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis dataKey="time" hide />
          <YAxis 
            domain={[minPrice - padding, maxPrice + padding]} 
            orientation="right" 
            tick={{fill: '#9ca3af', fontSize: 10}}
            tickFormatter={(val) => val.toLocaleString()}
            width={50}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
            itemStyle={{ color: '#fff' }}
            formatter={(value: number) => [value.toLocaleString(), 'Price']}
            labelFormatter={() => ''}
          />
          <ReferenceLine y={stock.previousClose} stroke="#6b7280" strokeDasharray="3 3" />
          <Area 
            type="monotone" 
            dataKey="price" 
            stroke={color} 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorPrice)" 
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StockChart;