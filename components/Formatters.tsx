import React from 'react';

export const KRW = ({ value }: { value: number }) => {
  return <>{new Intl.NumberFormat('ko-KR').format(Math.floor(value))}</>;
};

export const Rate = ({ value, showSign = true }: { value: number; showSign?: boolean }) => {
  const colorClass = value > 0 ? 'text-up' : value < 0 ? 'text-down' : 'text-gray-400';
  const sign = value > 0 && showSign ? '+' : '';
  return (
    <span className={`${colorClass} font-medium`}>
      {sign}{value.toFixed(2)}%
    </span>
  );
};

export const PriceChange = ({ current, reference }: { current: number; reference: number }) => {
  const diff = current - reference;
  const rate = reference === 0 ? 0 : (diff / reference) * 100;
  
  const colorClass = diff > 0 ? 'text-up' : diff < 0 ? 'text-down' : 'text-gray-400';
  const sign = diff > 0 ? '▲' : diff < 0 ? '▼' : '-';

  return (
    <div className={`flex items-center gap-1 ${colorClass}`}>
      <span className="text-xs">{sign}</span>
      <span className="font-bold"><KRW value={Math.abs(diff)} /></span>
      <span className="text-xs ml-1">({rate.toFixed(2)}%)</span>
    </div>
  );
};