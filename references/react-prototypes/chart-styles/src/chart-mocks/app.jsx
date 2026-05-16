// Chart styles canvas — 4 chart variants
const { useState } = React;

const Note = ({ title, points }) => (
  <div style={{ padding: '14px 18px', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, color: '#52525b', lineHeight: 1.7, background: '#fafaf9', height: '100%', boxSizing: 'border-box' }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: '#15171c', marginBottom: 8 }}>{title}</div>
    <ul style={{ margin: 0, paddingLeft: 16 }}>
      {points.map((p, i) => <li key={i} style={{ marginBottom: 4 }}>{p}</li>)}
    </ul>
  </div>
);

const App = () => {
  return (
    <DesignCanvas docTitle="價格圖表 · 視覺風格探索" docSubtitle="4 個方向的 K 線圖樣板，挑一個我們繼續做">
      <DCSection id="charts" title="A. 圖表視覺風格">
        <DCArtboard id="tv" label="① TradingView 經典" width={720} height={460}>
          <TradingViewClassic />
        </DCArtboard>
        <DCArtboard id="bb" label="② Bloomberg Terminal" width={720} height={460}>
          <BloombergTerminal />
        </DCArtboard>
        <DCArtboard id="wb" label="③ Webull 現代" width={720} height={460}>
          <WebullModern />
        </DCArtboard>
        <DCArtboard id="rh" label="④ Robinhood 極簡" width={720} height={460}>
          <RobinhoodMinimal />
        </DCArtboard>
      </DCSection>

      <DCSection id="notes" title="B. 風格特色比較">
        <DCArtboard id="tv-note" label="TradingView" width={340} height={460}>
          <Note title="TradingView 經典" points={[
            '深色 #131722 背景 — 業界最熟悉',
            '紅 #ef5350 / 綠 #26a69a 中性飽和',
            '頂部 OHLC inline 顯示',
            '右側價格軸 + 即時價格 tag',
            '繪圖工具 / 指標 / 比較 toolbar',
            '✅ 套件可直接 embed (Lightweight Charts)',
            '✅ 用戶最熟、學習成本低',
            '⚠️ 同質化高、不夠特別',
          ]} />
        </DCArtboard>
        <DCArtboard id="bb-note" label="Bloomberg" width={340} height={460}>
          <Note title="Bloomberg Terminal" points={[
            '純黑底 + 琥珀橘 #ffa500',
            'IBM Plex Mono 全字體',
            '頂部功能列 (GIP / DES / CN / GP)',
            '密集統計 (12 個指標 grid)',
            '青色 MA、F1-F5 快捷鍵',
            '✅ 視覺辨識度極高、專業感',
            '✅ 適合 power user / 量化',
            '⚠️ 沒有官方 widget，要自己刻',
            '⚠️ 風格太特定，可能勸退新手',
          ]} />
        </DCArtboard>
        <DCArtboard id="wb-note" label="Webull" width={340} height={460}>
          <Note title="Webull 現代" points={[
            '#0d1117 漸層深色背景',
            '紫 #7c5cff 主色 + 螢光綠/紅',
            'BB band 漸層填充',
            '空心 K 線（漲）/ 實心（跌）',
            '頂部品牌 + 大價格、底部買賣按鈕',
            '✅ 介於 TV 與 RH，平衡專業與美感',
            '✅ 跟 Resource 橘色品牌相對協調',
            '⚠️ 沒有 widget',
            '⚠️ 漸層多，會搶走資料的目光',
          ]} />
        </DCArtboard>
        <DCArtboard id="rh-note" label="Robinhood" width={340} height={460}>
          <Note title="Robinhood 極簡" points={[
            '純白背景、大留白',
            '單一折線、不畫 K',
            '36px 巨型價格、上下文最少',
            '上漲綠 #00c805 / 下跌橘 #ff5000',
            '時間區間是底部 8 顆藥丸',
            '✅ 移動端友好、新手無壓力',
            '✅ 跟 Resource 淺色主題一致',
            '⚠️ 缺乏專業資訊 (OHLC、指標)',
            '⚠️ 不適合做技術分析、回測',
          ]} />
        </DCArtboard>
      </DCSection>

      <DCSection id="recommend" title="C. 我的建議">
        <DCArtboard id="rec" label="混搭方案" width={1400} height={300}>
          <div style={{ padding: 24, background: '#fff', height: '100%', boxSizing: 'border-box', fontFamily: 'Inter, system-ui, sans-serif', color: '#15171c' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>建議：以 Webull 現代 為基底，加入 TradingView 的密度</div>
            <div style={{ fontSize: 13, color: '#52525b', lineHeight: 1.7, maxWidth: 900 }}>
              <p style={{ margin: '0 0 10px' }}><strong>為什麼 Webull?</strong> 風格現代、不會跟 Bloomberg 一樣勸退新手，紫色主色又能跟我們的橘色品牌互補。空心 K 線（漲）的設計也比實心紅綠更現代。</p>
              <p style={{ margin: '0 0 10px' }}><strong>為什麼加 TradingView 元素?</strong> TV 的 OHLC inline、繪圖工具列、右側價格軸是業界標準語彙，使用者一看就懂。我們把這些做進來，但維持 Webull 的視覺溫度。</p>
              <p style={{ margin: 0 }}><strong>淺色 vs 深色?</strong> 主站是淺色橘黃 (#fafaf9 + #ff6600)，但圖表頁很適合做<strong>淺/深主題切換</strong>，深色看盤更舒服，淺色印報告/分享好看。預設深色、可切。</p>
            </div>
          </div>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
};

ReactDOM.createRoot(document.getElementById('app')).render(<App />);
