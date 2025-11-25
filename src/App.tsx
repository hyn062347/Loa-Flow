import './App.css'
import SearchBar from './components/SearchBar'

const placeholders = [
  { title: '상승 아이템 #1', message: '데이터 수집 중입니다.' },
  { title: '상승 아이템 #2', message: '데이터 수집 중입니다.' },
  { title: '상승 아이템 #3', message: '데이터 수집 중입니다.' },
  { title: '상승 아이템 #4', message: '데이터 수집 중입니다.' },
]

function App() {
  return (
    <div className='page'>
      <header className='header'>
        <h1 className='main_title'>LOA FLOW</h1>
      </header>

      <main className='content'>
        <SearchBar />
        <div className='charts'>
          {placeholders.map((item) => (
            <div className='chart-card' key={item.title}>
              <div className='chart-card__title'>{item.title}</div>
              <div className='chart-card__body'>{item.message}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

export default App
