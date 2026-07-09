import type { ReactNode } from 'react';

type Repo = {
  name: string;
  lang: string;
  stars: number;
  desc: string;
  url: string;
};

type Stratum = {
  id: string;
  index: string;
  layer: string;
  layerEn: string;
  repo: Repo;
  note: ReactNode;
};

const strata: Stratum[] = [
  {
    id: 'ui',
    index: '01',
    layer: 'UI 프레임워크',
    layerEn: 'ui framework',
    repo: {
      name: 'Java_JavaUI',
      lang: 'Java',
      stars: 6,
      desc: '자바를 사용한 선언형 UI 프레임워크',
      url: 'https://github.com/3x-haust/Java_JavaUI',
    },
    note: '화면부터 다시 그렸다. 버튼이 왜 눌리는지 알아야 했다.',
  },
  {
    id: 'frontend',
    index: '02',
    layer: '프론트엔드 프레임워크',
    layerEn: 'frontend framework',
    repo: {
      name: 'Java_Cinereus',
      lang: 'Java',
      stars: 3,
      desc: '자바로 만들어본 프론트엔드? 프레임워크',
      url: 'https://github.com/3x-haust/Java_Cinereus',
    },
    note: '물음표는 그대로 뒀다. 확신은 없었고, 확신 없이도 만들었다.',
  },
  {
    id: 'backend',
    index: '03',
    layer: '백엔드 프레임워크',
    layerEn: 'backend framework',
    repo: {
      name: 'Java_AvnoiFramework',
      lang: 'Java',
      stars: 4,
      desc: '자바로 만들어본 백엔드 프레임워크',
      url: 'https://github.com/3x-haust/Java_AvnoiFramework',
    },
    note: '요청이 라우터를 타는 순서를 눈으로 보고 싶어서 다시 짰다.',
  },
  {
    id: 'language',
    index: '04',
    layer: '프로그래밍 언어',
    layerEn: 'language',
    repo: {
      name: 'Java_EzyLang',
      lang: 'Java',
      stars: 1,
      desc: 'AST를 사용해서 리팩토링 한 자바로 만든 언어',
      url: 'https://github.com/3x-haust/Java_EzyLang',
    },
    note: '프레임워크 밑에는 언어가 있었다. 그래서 언어를 팠다. 별 1개짜리 삽질.',
  },
  {
    id: 'database',
    index: '05',
    layer: '데이터베이스',
    layerEn: 'database / the floor',
    repo: {
      name: 'gitdb',
      lang: 'TypeScript',
      stars: 19,
      desc: 'GitHub-native encrypted database with a PostgreSQL-compatible facade',
      url: 'https://github.com/3x-haust/gitdb',
    },
    note: '가장 밑바닥. 데이터가 실제로 눕는 자리를 보고서야 멈췄다.',
  },
];

function Bench() {
  return (
    <div className="bench" aria-hidden="true">
      <span className="bench-tick" />
      <span className="bench-tick" />
      <span className="bench-tick" />
      <span className="bench-tick" />
      <span className="bench-tick" />
    </div>
  );
}

export default function Page() {
  return (
    <main className="page">
      <header className="ground">
        <Bench />
        <div className="ground-inner">
          <p className="ground-tag">/// 유성윤 — 3x-haust</p>
          <h1 className="claim">
            그는 바닥부터 다시 만들어본다,
            <br />왜 서 있는지 알기 위해서.
          </h1>
          <p className="ground-sub">
            미림마이스터고등학교. 서버 위에 서버, 언어 위에 언어 — 매번 같은 강박으로
            바닥까지 내려간다. 69개 저장소 중 그 강박이 가장 또렷한 다섯 개만 여기 놓는다.
          </p>
          <dl className="ground-meta">
            <div>
              <dt>github</dt>
              <dd>
                <a href="https://github.com/3x-haust" target="_blank" rel="noreferrer">
                  github.com/3x-haust
                </a>
              </dd>
            </div>
            <div>
              <dt>blog</dt>
              <dd>
                <a href="https://3xhaust.dev" target="_blank" rel="noreferrer">
                  3xhaust.dev
                </a>
              </dd>
            </div>
            <div>
              <dt>twitter</dt>
              <dd>
                <a href="https://twitter.com/3xhaust_" target="_blank" rel="noreferrer">
                  @3xhaust_
                </a>
              </dd>
            </div>
            <div>
              <dt>since</dt>
              <dd>2021.11 — 69 repos · 98 followers</dd>
            </div>
          </dl>
        </div>
        <p className="scroll-cue">↓ 스택을 따라 내려간다</p>
      </header>

      <div className="stack" role="list">
        {strata.map((s) => (
          <section key={s.id} role="listitem" className={`stratum stratum-${s.id}`}>
            <Bench />
            <div className="stratum-inner">
              <div className="stratum-head">
                <span className="stratum-index">{s.index}</span>
                <div className="stratum-titles">
                  <span className="stratum-layer">{s.layer}</span>
                  <span className="stratum-layer-en">{s.layerEn}</span>
                </div>
              </div>

              <a className="repo-card" href={s.repo.url} target="_blank" rel="noreferrer">
                <span className="repo-name">{s.repo.name}</span>
                <span className="repo-desc">"{s.repo.desc}"</span>
                <span className="repo-tags">
                  <span className="repo-tag">{s.repo.lang}</span>
                  <span className="repo-tag">★ {s.repo.stars}</span>
                  <span className="repo-tag repo-link-tag">github.com/3x-haust/{s.repo.name} ↗</span>
                </span>
              </a>

              <p className="stratum-note">{s.note}</p>
            </div>
          </section>
        ))}
      </div>

      <footer className="floor">
        <Bench />
        <div className="floor-inner">
          <p className="floor-label">/// 그 아래는 없다 — end of stack</p>
          <p className="floor-body">
            나머지 64개는 이 강박의 부산물이거나 곁가지다. workshop-wallpaper-bridge(★212)도
            그중 하나 — 잘 쓰이지만, 이 페이지의 요지는 아니다.
          </p>
          <p className="floor-links">
            <a href="https://github.com/3x-haust" target="_blank" rel="noreferrer">
              전체 저장소 보기 →
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}
