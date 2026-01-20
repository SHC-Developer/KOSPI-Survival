import React, { useEffect, useState } from 'react';
import { useAuthStore, UserInfo } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import { KRW } from './Formatters';

// 관리자 이메일 목록
const ADMIN_EMAILS = ['bluesangh@gmail.com'];

const RankingPage: React.FC = () => {
  const { getAllUsersForRanking, user } = useAuthStore();
  const { stocks } = useGameStore();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRankings();
    // 10초마다 순위 갱신 (주가 변경과 관계없이)
    const interval = setInterval(loadRankings, 10000);
    return () => clearInterval(interval);
  }, []); // 초기 로드 및 10초 간격 갱신만

  const loadRankings = async () => {
    setLoading(true);
    const userList = await getAllUsersForRanking();
    
    // 총잔고 계산 (현금 + 주식 평가액)
    // stocks는 Firebase에서 동기화되어 모든 사용자가 동일한 주가를 보게 됨
    const usersWithTotalAsset = await Promise.all(
      userList.map(async (u) => {
        // Firestore에서 최신 포트폴리오 가져오기
        const { getDoc, doc } = await import('firebase/firestore');
        const { db } = await import('../firebase/config');
        
        try {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            const userPortfolio = data.portfolio || [];
            
            // 주식 평가액 계산 (현재 시장가 사용)
            let stockValue = 0;
            userPortfolio.forEach((item: { stockId: string; quantity: number }) => {
              const stock = stocks.find(s => s.id === item.stockId);
              if (stock) {
                stockValue += stock.currentPrice * item.quantity;
              }
            });
            
            const totalAsset = (data.cash || 0) + stockValue;
            return { ...u, totalAsset, cash: data.cash || 0 };
          }
        } catch (error) {
          console.error('Error calculating total asset:', error);
        }
        
        return { ...u, totalAsset: u.totalAsset || u.cash || 0 };
      })
    );
    
    // 관리자 제외 필터링
    const filteredUsers = usersWithTotalAsset.filter(u => !ADMIN_EMAILS.includes(u.email));
    
    // 총잔고 기준 내림차순 정렬
    filteredUsers.sort((a, b) => (b.totalAsset || 0) - (a.totalAsset || 0));
    setUsers(filteredUsers);
    setLoading(false);
  };

  const getRankIcon = (rank: number, total: number) => {
    if (rank === 1) return '👑';
    if (rank === total) return '💩';
    return null;
  };

  const getRankColor = (rank: number, total: number) => {
    if (rank === 1) return 'text-yellow-400';
    if (rank === 2) return 'text-gray-300';
    if (rank === 3) return 'text-orange-400';
    if (rank === total) return 'text-gray-600';
    return 'text-gray-400';
  };

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* 헤더 */}
      <header className="bg-gray-900 px-4 py-3 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white">🏆 순위표</h1>
        <p className="text-xs text-gray-500 mt-1">총잔고 기준 (10초마다 자동 갱신)</p>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-500">순위를 불러오는 중...</p>
          </div>
        </div>
      ) : users.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">등록된 사용자가 없습니다.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* 상위 3명 강조 */}
          {users.slice(0, 3).length > 0 && (
            <div className="p-4 bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800">
              <h2 className="text-sm font-bold text-gray-400 mb-3">🏅 TOP 3</h2>
              <div className="space-y-2">
                {users.slice(0, 3).map((u, idx) => {
                  const rank = idx + 1;
                  const isCurrentUser = user?.uid === u.uid;
                  return (
                    <div
                      key={u.uid}
                      className={`p-3 rounded-lg border-2 ${
                        rank === 1
                          ? 'bg-yellow-900/20 border-yellow-600'
                          : rank === 2
                          ? 'bg-gray-800/50 border-gray-600'
                          : 'bg-orange-900/20 border-orange-600'
                      } ${isCurrentUser ? 'ring-2 ring-orange-500' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{getRankIcon(rank, users.length) || `#${rank}`}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">
                                {u.nickname || '익명'}
                              </span>
                              {isCurrentUser && (
                                <span className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded">나</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold text-lg ${getRankColor(rank, users.length)}`}>
                            <KRW value={u.totalAsset || u.cash || 0} />
                          </p>
                          <p className="text-xs text-gray-500">
                            현금: <KRW value={u.cash || 0} />
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 전체 순위 */}
          <div className="p-4">
            <h2 className="text-sm font-bold text-gray-400 mb-3">전체 순위</h2>
            <div className="space-y-2">
              {users.map((u, idx) => {
                const rank = idx + 1;
                const isCurrentUser = user?.uid === u.uid;
                const isTop3 = rank <= 3;
                
                if (isTop3) return null; // 상위 3명은 이미 표시됨
                
                return (
                  <div
                    key={u.uid}
                    className={`p-3 rounded-lg bg-gray-900 border border-gray-800 ${
                      isCurrentUser ? 'ring-2 ring-orange-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-gray-500 w-8">
                          {getRankIcon(rank, users.length) || `#${rank}`}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">
                              {u.nickname || '익명'}
                            </span>
                            {isCurrentUser && (
                              <span className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded">나</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${getRankColor(rank, users.length)}`}>
                          <KRW value={u.totalAsset || u.cash || 0} />
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RankingPage;
