import './page.css'

type Exhibit = {
  tag: string
  name: string
  lang: string
  stars: string
  desc: string
  url: string
}

const exhibits: Exhibit[] = [
  {
    tag: '01 — 백엔드',
    name: 'Java_AvnoiFramework',
    lang: 'Java',
    stars: '★ 4',
    desc: '자바로 만들어본 백엔드 프레임워크',
    url: 'https://github.com/3x-haust/Java_AvnoiFramework',
  },
  {
    tag: '02 — 프론트엔드',
    name: 'Java_Cinereus',
    lang: 'Java',
    stars: '★ 3',
    desc: '자바로 만들어본 프론트엔드? 프레임워크',
    url: 'https://github.com/3x-haust/Java_Cinereus',
  },
  {
    tag: '03 — UI',
    name: 'Java_JavaUI',
    lang: 'Java',
    stars: '★ 6',
    desc: '자바를 사용한 선언형 UI 프레임워크',
    url: 'https://github.com/3x-haust/Java_JavaUI',
  },
  {
    tag: '04 — 언어',
    name: 'Java_EzyLang',
    lang: 'Java',
    stars: '★ 1',
    desc: 'AST를 사용해서 리팩토링 한 자바로 만든 언어',
    url: 'https://github.com/3x-haust/Java_EzyLang',
  },
  {
    tag: '05 — 데이터베이스',
    name: 'gitdb',
    lang: 'TypeScript',
    stars: '★ 19',
    desc: 'GitHub-native encrypted database with a PostgreSQL-compatible facade',
    url: 'https://github.com/3x-haust/gitdb',
  },
]

const alsoOnBench = [
  { name: 'Python_Ezy_API', note: '서비스, dto, entity 만 사용하여 백엔드를 만들 수 있는 프레임워크', url: 'https://github.com/3x-haust/Python_Ezy_API' },
  { name: 'nlbackend', note: '자연어로 등록된 액션 하나를 고르고 인자를 뽑아내는 로컬 LLM 백엔드', url: 'https://github.com/3x-haust/nlbackend' },
  { name: 'Mimikyu', note: '피그마를 그대로 구현하는 스킬', url: 'https://github.com/3x-haust/Mimikyu' },
  { name: 'Nest.js_MmhsOAuth_Server', note: 'bsm 따라한거 맞습니다', url: 'https://github.com/3x-haust/Nest.js_MmhsOAuth_Server' },
  { name: 'Flutter_2025_uthon_argo', note: '역대급으로 드러운 해커톤 코드', url: 'https://github.com/3x-haust/Flutter_2025_uthon_argo' },
  { name: 'workshop-wallpaper-bridge', note: 'Local-only macOS bridge for personally copied Wallpaper Engine Workshop wallpapers · ★ 212', url: 'https://github.com/3x-haust/workshop-wallpaper-bridge' },
]

export default function Page() {
  return (
    <div className="bench">
      <header className="hero">
        <p className="hero-tag">유성윤 / 3x-haust</p>
        <h1 className="hero-claim">
          바닥을 이해하려고,
          <br />
          바닥부터 다시 만든다.
        </h1>
        <p className="hero-sub">
          미림마이스터고등학교 재학. 백엔드, 프론트엔드, UI, 언어, 데이터베이스 —
          같은 강박을 다섯 번 반복했다. 아래는 별이 아니라 순서로 정렬한 증거다.
        </p>
        <nav className="hero-links" aria-label="외부 링크">
          <a className="link" href="https://3xhaust.dev" target="_blank" rel="noreferrer">
            blog↗
          </a>
          <a className="link" href="https://github.com/3x-haust" target="_blank" rel="noreferrer">
            github↗
          </a>
          <a className="link" href="https://twitter.com/3xhaust_" target="_blank" rel="noreferrer">
            twitter↗
          </a>
        </nav>
      </header>

      <div className="ruler" aria-hidden="true">
        <span>0</span>
        <span>10</span>
        <span>20</span>
        <span>30cm</span>
      </div>

      <main className="workbench">
        {exhibits.map((ex, i) => (
          <section className="exhibit" key={ex.name}>
            <div className="exhibit-tag">{ex.tag}</div>
            <div className="exhibit-body">
              <h2 className="exhibit-name">
                <a href={ex.url} target="_blank" rel="noreferrer">
                  {ex.name}
                </a>
              </h2>
              <p className="exhibit-desc">{ex.desc}</p>
              <dl className="exhibit-meta">
                <div>
                  <dt>lang</dt>
                  <dd>{ex.lang}</dd>
                </div>
                <div>
                  <dt>stars</dt>
                  <dd>{ex.stars}</dd>
                </div>
                <div>
                  <dt>no.</dt>
                  <dd>{String(i + 1).padStart(2, '0')} / 05</dd>
                </div>
              </dl>
            </div>
          </section>
        ))}
      </main>

      <section className="drawer">
        <h3 className="drawer-title">작업대 서랍 — 나머지 부품</h3>
        <p className="drawer-note">
          69개 저장소 중 나머지. 정리는 안 됐지만 버리진 않았다.
        </p>
        <ul className="drawer-list">
          {alsoOnBench.map((r) => (
            <li key={r.name}>
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.name}
              </a>
              <span className="drawer-sep">—</span>
              <span className="drawer-desc">{r.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="tailplate">
        <p>
          GitHub 가입 2021년 11월 · 공개 저장소 69개 · 팔로워 98명 · README는 없음.
          <br />
          이 페이지가 대신한다.
        </p>
        <p className="tailplate-links">
          <a href="https://3xhaust.dev" target="_blank" rel="noreferrer">
            3xhaust.dev
          </a>
          <span className="drawer-sep">·</span>
          <a href="https://github.com/3x-haust" target="_blank" rel="noreferrer">
            github.com/3x-haust
          </a>
          <span className="drawer-sep">·</span>
          <a href="https://twitter.com/3xhaust_" target="_blank" rel="noreferrer">
            @3xhaust_
          </a>
        </p>
      </footer>
    </div>
  )
}
