import { uid, type Board, type Shape, type Kind } from '@whirl/scene';
export function template(kind: 'welcome' | 'flowchart' | 'retro' | 'blank'): Board {
  const nodes: Shape[] = [], edges: Board['edges'] = [];
  const add = (id: string, kind: Kind, x: number, y: number, width: number, height: number, text: string, color = '#ffffff') => nodes.push({ id, kind, x, y, width, height, text, color });
  if (kind === 'welcome') {
    add('heading', 'text', 60, 15, 560, 70, 'Good things start with a little space.');
    add('sub', 'text', 60, 85, 470, 48, 'Your next big idea starts here.');
    add('start', 'ellipse', 105, 215, 180, 72, 'A spark of an idea', '#eee9ff');
    add('explore', 'rectangle', 105, 375, 180, 80, 'Make some room\nExplore the possibilities', '#ffffff');
    add('decision', 'diamond', 420, 339, 170, 150, 'What if\nwe tried it?', '#e5f3ee');
    add('build', 'rectangle', 725, 375, 190, 80, 'Make it happen', '#eee9ff');
    add('note1', 'sticky', 695, 150, 190, 154, 'Small steps.\nWild ideas.\nNo wrong answers.', '#fff2cc');
    add('note2', 'sticky', 95, 565, 190, 154, 'Double-click anything\nto make it yours.', '#ffe6dc');
    add('note3', 'sticky', 335, 565, 190, 154, 'Try the arrow tool\nto connect two ideas.', '#e4efff');
    add('footer', 'text', 620, 583, 330, 70, 'A little messy.\nA lot of possibility.');
    edges.push({ id: 'e1', source: 'start', target: 'explore', text: '' }, { id: 'e2', source: 'explore', target: 'decision', text: 'ask a question' }, { id: 'e3', source: 'decision', target: 'build', text: 'yes, let’s' });
  } else if (kind === 'flowchart') {
    add('title', 'text', 100, 30, 650, 64, 'From “what if” to what’s next');
    add('start', 'ellipse', 100, 180, 180, 72, 'Start here', '#eee9ff');
    add('step', 'rectangle', 100, 340, 180, 88, 'Explore the idea');
    add('question', 'diamond', 410, 315, 180, 140, 'Ready to go?', '#e5f3ee');
    add('finish', 'ellipse', 740, 348, 180, 72, 'Make it real', '#eee9ff');
    add('improve', 'rectangle', 410, 550, 180, 88, 'Try another angle', '#fff2cc');
    edges.push({ id: 'a', source: 'start', target: 'step', text: '' }, { id: 'b', source: 'step', target: 'question', text: '' }, { id: 'c', source: 'question', target: 'finish', text: 'Yes' }, { id: 'd', source: 'question', target: 'improve', text: 'Not yet' }, { id: 'e', source: 'improve', target: 'step', text: '' });
  } else if (kind === 'retro') {
    add('title', 'text', 90, 30, 760, 64, 'Take a breath. Look back. Move forward.');
    ['What went well?', 'What could be better?', 'What will we try?'].forEach((text, i) => {
      add(`h${i}`, 'text', 60 + i * 320, 160, 280, 70, text);
      for (let j = 0; j < 2; j++) add(`n${i}${j}`, 'sticky', 105 + i * 320, 275 + j * 210, 190, 160, j ? 'Add another thought…' : 'Add your thoughts here…', ['#e5f3ee', '#ffe6dc', '#eee9ff'][i]);
    });
  }
  return { id: uid(), title: kind === 'welcome' ? 'A little room for big ideas' : kind === 'flowchart' ? 'The next big thing' : kind === 'retro' ? 'A moment to reflect' : 'Untitled board', nodes, edges, updatedAt: Date.now() };
}
