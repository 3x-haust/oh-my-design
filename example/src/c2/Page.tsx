import type { ReactNode } from 'react'

type Row = {
  tick: string
  label: string
  children: ReactNode
}

const javaExhibits = [
  {
    name: 'Java_AvnoiFramework',
    lang: 'Java',
    stars: 4,
    desc: '자바로 만들어본 백엔드 프레임워크',
    url: 'https://github.com/3x-haust/Java_AvnoiFramework',
  },
  {
    name: 'Java_Cinereus',
    lang: 'Java',
    stars: 3,
    desc: '자바로 만들어본 프론트엔드? 프레임워크',
    url: 'https://github.com/3x-haust/Java_Cinereus',
  },
  {
    name: 'Java_JavaUI',
    lang: 'Java',
    stars: 6,
    desc: '자바를 사용한 선언형 UI 프레임워크',
    url: 'https://github.com/3x-haust/Java_JavaUI',
  },
  {
    name: 'Java_EzyLang',
    lang: 'Java',
    stars: 1,
    desc: 'AST를 사용해서 리팩토링 한 자바로 만든 언어',
    url: 'https://github.com/3x-haust/Java_EzyLang',
  },
  {
    name: 'Python_Ezy_API',
    lang: 'Python',
    stars: 2,
    desc: '서비스, dto, entity 만 사용하여 백엔드를 만들 수 있는 프레임워크',
    url: 'https://github.com/3x-haust/Python_Ezy_API',
  },
]

const scaleExhibits = [
  {
    name: 'gitdb',
    lang: 'TypeScript',
    stars: 19,
    desc: 'GitHub-native encrypted database with a PostgreSQL-compatible facade',
    url: 'https://github.com/3x-haust/gitdb',
  },
  {
    name: 'nlbackend',
    lang: 'TypeScript',
    stars: 3,
    desc: 'Natural-language backend: a local LLM picks one of your registered actions and extracts its arguments; your code validates (zod), authorizes, and executes.',
    url: 'https://github.com/3x-haust/nlbackend',
  },
  {
    name: 'Mimikyu',
    lang: 'TypeScript',
    stars: 10,
    desc: '피그마를 그대로 구현하는 스킬',
    url: 'https://github.com/3x-haust/Mimikyu',
  },
]

function Ruler({ rows }: { rows: number }) {
  return (
    <div className="ruler" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <span className="ruler-tick" key={i} />
      ))}
    </div>
  )
}

function SchematicRow({ tick, label, children }: Row) {
  return (
    <div className="row">
      <div className="row-rail">
        <span className="row-tick">{tick}</span>
        <span className="row-label">{label}</span>
      </div>
      <div className="row-leader" aria-hidden="true" />
      <div className="row-content">{children}</div>
    </div>
  )
}

export default function Page() {
  return (
    <div className="sheet">
      <header className="plate">
        <div className="plate-meta">
          <span>DWG NO. 3X-HAUST-01</span>
          <span>SCALE 1:1</span>
          <span>REV 2026-07-09</span>
        </div>
        <h1 className="plate-claim">
          그는 바닥을 다시 만든다, 바닥이 어떻게 만들어지는지 알기 위해.
        </h1>
        <p className="plate-sub">
          백엔드 프레임워크, 프론트엔드 프레임워크, UI 프레임워크, 프로그래밍
          언어, 데이터베이스 — 한 가지 집착의 다섯 가지 판본.
        </p>
      </header>

      <div className="drawing">
        <Ruler rows={7} />

        <SchematicRow tick="01" label="SUBJECT">
          <h2 className="name">유성윤</h2>
          <p className="mono small">
            3x-haust · 미림마이스터고등학교, Seoul
          </p>
          <p className="mono small dim">
            GitHub since Nov 2021 · 69 public repos · 98 followers
          </p>
        </SchematicRow>

        <SchematicRow tick="02" label="OBSESSION">
          <p className="row-note">
            같은 부품을 다섯 번 다시 깎았다. 이름만 봐도 패턴이 보인다.
          </p>
          <ul className="parts-list">
            {javaExhibits.map((r) => (
              <li className="part" key={r.name}>
                <div className="part-head">
                  <a
                    className="part-name"
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.name}
                  </a>
                  <span className="part-tags mono small">
                    <span>{r.lang}</span>
                    <span>★{r.stars}</span>
                  </span>
                </div>
                <p className="part-desc">{r.desc}</p>
              </li>
            ))}
          </ul>
        </SchematicRow>

        <SchematicRow tick="03" label="COUNTEREXAMPLE">
          <p className="row-note">
            가장 별이 많은 것이 가장 그를 대표하지는 않는다.
          </p>
          <div className="part part-muted">
            <div className="part-head">
              <a
                className="part-name"
                href="https://github.com/3x-haust/workshop-wallpaper-bridge"
                target="_blank"
                rel="noreferrer"
              >
                workshop-wallpaper-bridge
              </a>
              <span className="part-tags mono small">
                <span>Swift</span>
                <span>★212</span>
              </span>
            </div>
            <p className="part-desc">
              Local-only macOS bridge for personally copied Wallpaper Engine
              Workshop wallpapers
            </p>
            <p className="mono small dim annot">
              # 실용적인 유틸리티. 바닥을 다시 만드는 일과는 무관하다.
            </p>
          </div>
        </SchematicRow>

        <SchematicRow tick="04" label="SCALE">
          <p className="row-note">
            깎는 연습이 실제로 쓸 수 있는 것으로 이어질 때.
          </p>
          <ul className="parts-list">
            {scaleExhibits.map((r) => (
              <li className="part" key={r.name}>
                <div className="part-head">
                  <a
                    className="part-name"
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.name}
                  </a>
                  <span className="part-tags mono small">
                    <span>{r.lang}</span>
                    <span>★{r.stars}</span>
                  </span>
                </div>
                <p className="part-desc">{r.desc}</p>
              </li>
            ))}
          </ul>
        </SchematicRow>

        <SchematicRow tick="05" label="ADMISSIONS">
          <p className="row-note">그가 직접 붙인 라벨, 그대로.</p>
          <div className="admission-grid">
            <div className="part part-muted">
              <a
                className="part-name"
                href="https://github.com/3x-haust/Nest.js_MmhsOAuth_Server"
                target="_blank"
                rel="noreferrer"
              >
                Nest.js_MmhsOAuth_Server
              </a>
              <p className="part-desc quote">"bsm 따라한거 맞습니다"</p>
            </div>
            <div className="part part-muted">
              <a
                className="part-name"
                href="https://github.com/3x-haust/Flutter_2025_uthon_argo"
                target="_blank"
                rel="noreferrer"
              >
                Flutter_2025_uthon_argo
              </a>
              <p className="part-desc quote">
                "역대급으로 드러운 해커톤 코드"
              </p>
            </div>
          </div>
        </SchematicRow>

        <SchematicRow tick="06" label="CONTACT">
          <ul className="link-list">
            <li>
              <span className="mono small dim link-key">BLOG</span>
              <a href="https://3xhaust.dev" target="_blank" rel="noreferrer">
                3xhaust.dev
              </a>
            </li>
            <li>
              <span className="mono small dim link-key">GITHUB</span>
              <a
                href="https://github.com/3x-haust"
                target="_blank"
                rel="noreferrer"
              >
                github.com/3x-haust
              </a>
            </li>
            <li>
              <span className="mono small dim link-key">TWITTER</span>
              <a
                href="https://twitter.com/3xhaust_"
                target="_blank"
                rel="noreferrer"
              >
                @3xhaust_
              </a>
            </li>
          </ul>
        </SchematicRow>

        <SchematicRow tick="07" label="NOTE">
          <p className="row-note last">
            프로필 README는 없다. 이 페이지가 유일한 자기소개다.
          </p>
        </SchematicRow>
      </div>

      <footer className="sheet-footer mono small dim">
        <span>END OF DRAWING</span>
        <span>3X-HAUST-01 / 07 SHEETS</span>
      </footer>
    </div>
  )
}
