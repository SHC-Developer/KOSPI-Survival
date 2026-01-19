import React from 'react';
import { useGameStore } from '../store/gameStore';

const NewsPanel: React.FC = () => {
  const { news } = useGameStore();

  return (
    <div className="bg-cardbg rounded-lg border border-gray-800 flex flex-col h-full overflow-hidden">
        <div className="p-3 bg-gray-900/50 border-b border-gray-700 flex justify-between items-center">
            <span className="font-bold text-sm text-gray-300">시장 뉴스</span>
            <span className="text-xs text-gray-500 animate-pulse">● Live</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {news.length === 0 && <div className="text-gray-500 text-center py-4 text-sm">아직 뉴스가 없습니다.</div>}
            {news.map((item) => (
                <div key={item.id} className="p-3 rounded bg-gray-800/80 border border-gray-700 hover:bg-gray-700/50 transition-colors">
                    <div className="flex justify-between mb-1">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${item.effect === 'GOOD' ? 'bg-up/20 text-up' : 'bg-down/20 text-down'}`}>
                            {item.effect === 'GOOD' ? '호재' : '악재'}
                        </span>
                        <span className="text-xs text-gray-500">Tick: {item.time}</span>
                    </div>
                    <div className="text-sm font-medium text-gray-200">{item.title}</div>
                </div>
            ))}
        </div>
    </div>
  );
};

export default NewsPanel;