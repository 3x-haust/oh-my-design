import type { PortablePiContext } from './omd-runtime.ts';
import type { InterviewAnswer, InterviewQuestion, ComparisonChoice, Satisfaction } from '../core/coach/developer-evaluation-contract.ts';

export async function collectDeveloperInterview(context: PortablePiContext, repair = false) {
  const questions: InterviewQuestion[] = [];
  const answers: InterviewAnswer[] = [];
  const select = context.ui?.select;
  if (select === undefined) throw new Error('OMD_DEVELOPER_UI_REQUIRED');
  const ask = async <T extends string>(id: string, prompt: string, options: readonly Readonly<{ id: T; label: string }>[]) => {
    const selected = await select(prompt, options.map(option => option.label));
    if (selected === undefined) return null;
    const option = options.find(option => option.label === selected);
    if (option === undefined) throw new Error('OMD_DEVELOPER_ANSWER_INVALID');
    questions.push({ id, prompt, options });
    answers.push({ questionId: id, optionIds: [option.id], text: selected });
    return option.id;
  };
  const choice = await ask<ComparisonChoice>('comparison', '어느 결과가 더 좋은가요?', [
    { id: 'a', label: 'A가 더 좋다' }, { id: 'b', label: 'B가 더 좋다' },
    { id: 'tie', label: '비슷하다' }, { id: 'neither', label: '둘 다 만족스럽지 않다' },
    { id: 'uncertain', label: '판단하기 어렵다' },
  ]);
  if (choice === null) return null;
  const satisfaction = await ask<Satisfaction>('satisfaction', '상대적 비교와 별개로, 현재 결과가 만족스러운가요?', [
    { id: 'satisfied', label: '만족한다' }, { id: 'mixed', label: '일부는 좋지만 더 수정해야 한다' },
    { id: 'unsatisfied', label: '만족스럽지 않다' }, { id: 'uncertain', label: '판단하기 어렵다' },
  ]);
  if (satisfaction === null) return null;
  const preserve = await ask('preserve', '좋아서 유지하고 싶은 부분은?', [
    { id: 'hierarchy', label: '정보 배치' }, { id: 'color', label: '색 조합' },
    { id: 'type', label: '글자 스타일' }, { id: 'spacing', label: '여백' },
    { id: 'none', label: '특별히 없음' }, { id: 'text', label: '직접 입력' },
  ]);
  if (preserve === null) return null;
  const change = await ask('change', '가장 먼저 바꾸고 싶은 부분은?', [
    { id: 'complex', label: '복잡해 보인다' }, { id: 'empty', label: '너무 비어 있다' },
    { id: 'hierarchy', label: '중요한 것이 먼저 보이지 않는다' }, { id: 'readability', label: '읽기 불편하다' },
    { id: 'fit', label: '전체 분위기가 맞지 않는다' }, { id: 'unknown', label: '이유는 모르겠지만 별로다' },
    { id: 'retain', label: '현재안을 유지한다' }, { id: 'text', label: '직접 입력' },
  ]);
  if (change === null) return null;
  if (change === 'complex') {
    await ask('complexity', '복잡하게 느껴지는 부분을 좁힐 수 있나요?', [
      { id: 'content', label: '정보량' }, { id: 'decoration', label: '장식' },
      { id: 'hierarchy', label: '위계' }, { id: 'spacing', label: '간격' },
      { id: 'uncertain', label: '설명하기 어렵다' },
    ]);
  }
  if ((preserve === 'text' || change === 'text') && context.ui?.input) {
    const text = await context.ui.input('직접 남길 의견 (건너뛰어도 됩니다)');
    if (text !== undefined && text.length > 0) {
      questions.push({ id: 'free-text', prompt: '직접 남길 의견', options: [] });
      answers.push({ questionId: 'free-text', optionIds: [], text });
    }
  }
  const postChangeStart = questions.length;
  if (repair) {
    const result = await ask('post-change', '수정 전 A와 수정 후 B를 비교하면?', [
      { id: 'satisfied', label: '좋아졌고 만족한다' }, { id: 'improved', label: '좋아졌지만 더 수정해야 한다' },
      { id: 'same', label: '차이가 없다' }, { id: 'before', label: '이전이 더 좋다' },
      { id: 'mixed', label: '좋아진 부분과 나빠진 부분이 함께 있다' }, { id: 'uncertain', label: '판단하기 어렵다' },
    ]);
    if (result === null) return null;
  }
  const postChange = { questions: questions.splice(postChangeStart), answers: answers.splice(postChangeStart) };
  const reuse = await ask('reuse', '이 평가를 이후 작업의 비공개 보정 사례로 사용할까요?', [
    { id: 'allow', label: '이 작업 맥락에서만 재사용 허용' },
    { id: 'deny', label: '이번 비교 기록만 보관' },
  ]);
  return {
    humanResponse: {
      interview: { questions, answers }, comparisonChoice: choice, satisfaction,
      postChange,
    },
    reuse: reuse === 'allow' ? 'allow-private-advisory-reuse' as const : 'deny' as const,
  };
}
