import campus from './campus-data.json' with {type:'json'};
export const campusBase=campus;
const makeRooms = (floor, rows) => rows.map(([number, name, suffix = '']) => ({
  id: 'index-' + floor + '-' + (number || 'named') + (suffix || (number ? '' : '-' + rows.findIndex(r => r[1] === name))),
  floor, number, name, tags: [name.includes('机房') ? '电脑机房' : name.includes('实验') ? '实验室' : name.includes('画室') || name.includes('写生') ? '美术' : name.includes('办公室') ? '办公' : '教学空间'],
  point: null, source: 'photo-67', status: 'photo-recorded'
}));
const multimedia = n => [String(n), '多媒体教室'];
const arts = (n, type, index) => [String(n), '艺术系' + type + '（' + index + '）'];
export const indexedRooms = [
  ...makeRooms(1, [...[101,102,103,104,105,106,107,110,111].map(multimedia), ...Array.from({length:6},(_,i)=>arts(112+i,'教室',i+1)), ...Array.from({length:4},(_,i)=>arts(118+i,'画室',i+1)), multimedia(123), multimedia(127)]),
  ...makeRooms(2, [...[201,202,203,204,205,206,208,209].map(multimedia), ...Array.from({length:6},(_,i)=>arts(210+i,'教室',i+7)), ...Array.from({length:3},(_,i)=>arts(216+i,'画室',i+5)), ['219','艺术系美术学教研室'], arts(220,'人体写生室',1), multimedia(222), multimedia(223)]),
  ...makeRooms(3, [...[301,302,303,304,305,306,308,309].map(multimedia), arts(310,'人体写生室',2), ...Array.from({length:3},(_,i)=>arts(311+i,'画室',i+8)), arts(314,'教室',11), ['315','艺术系简易多媒体教室'],['316','艺术系艺术设计教研室'],['317','艺术系非编室'],['318','艺术系阅览室'],multimedia(319),multimedia(320)]),
  ...makeRooms(4, [['401','公共机房（1）'],['402','公共机房（2）'],['403','材料库房'],['404','教师办公室'],['405','公共机房（3）'],['406','公共机房（4）'],['407','服务器机房'],['408','多媒体教室总控室／调频发射控制室（前门）','-front'],['408','微格教学准备室（后门）','-back'],['409','新闻演播厅'],['410','编辑与控制室'],...Array.from({length:3},(_,i)=>[String(411+i),'数字语音实验室']),...Array.from({length:4},(_,i)=>[String(414+i),'微格教室']),['418','数字语音实验室'],['419','数字语音实验室'],['420','精品课程录像室'],multimedia(421),multimedia(422),multimedia(423)]),
  ...makeRooms(5, [['501','公共机房（5）'],['502','公共机房（6）'],['503','材料库房'],['504','教师办公室'],['505','公共机房（7）'],['506','公共机房（8）'],['507','服务器机房'],['508','大学物理实验室（1）'],['509','大学物理实验室（2）'],['510','大学物理实验室（4）'],['511','大学物理实验室（5）'],['512','大学物理实验室（6）'],['513','实验研究室（2）'],['514','实验研究室（1）'],['515','演示实验室'],multimedia(516),['517','办公室（1）'],['518','办公室（2）'],['519','办公室（3）'],['520','大学物理实验室（3）'],['521','材料库房']]),
  ...makeRooms(6, [[null,'三明学院服务海西重点项目实验室'],[null,'海西闽中动漫游研发制作中心']])
];
export const buildings = [
  {id:'library',name:'逸夫图书馆',aliases:['图书馆'],category:'study',categoryLabel:'学习空间',model:'library',position:[-25,0,14],labelHeight:27,description:'两座高低不同的塔楼与弧形入口，是校园里很容易辨认的建筑。',sources:['现场照片 36、58、63、127','学校官方校园示意图'],facts:['前部弧形入口与蓝色玻璃带参考照片58。','背面可见负一层架空空间，详见照片36、127。'],floorNote:'楼层用途与室内教室资料待补充。',floors:[],rooms:[]},
  {id:'boxue',name:'博学楼',aliases:[],category:'teaching',categoryLabel:'教学建筑',model:'boxue',position:[28,0,10],labelHeight:25,description:'多条教学翼、两处院落空隙与弧形转角；前后入口分别对应二层和一层，高差继续核对。',sources:['现场照片 47、64、65、66、71','用户提供的入口说明'],facts:['正面入口位于二层（照片64及说明）。','背面小门通往一层（照片47及说明）。','位于逸夫图书馆北侧，两者均在致用大道西侧。'],floorNote:'照片67的索引名称为“综合实验楼”，暂未将其中教室归入博学楼。',floors:[],rooms:[]},
  {id:'administration',name:'行政楼',aliases:[],category:'service',categoryLabel:'行政服务',model:'administration',position:[3,0,-43],labelHeight:36,description:'以浅色主楼、中央玻璃立面和门厅表现建筑轮廓。',sources:['现场照片 91、95、98、100、101','用户确认的西北门与广场关系'],facts:['西北门前广场是项目相对高度基准。','广场至行政楼有台阶；此处高度是显示参数。'],floorNote:'尚未获得可核对的室内楼层用途清单。',floors:[],rooms:[]},
  {id:'experiment-index',name:'综合实验楼 · 楼层资料',aliases:['综合实验楼','公共机房','分布索引'],category:'teaching',categoryLabel:'楼层资料',model:null,position:null,labelHeight:null,description:'来自现场分布索引的教室资料。建筑归属待核对，暂不在地图生成点位。',sources:['现场照片67：三明学院综合实验楼分布索引'],facts:['按索引保留1F—6F和真实名称、编号。','408前门与后门分别建条目，防止编号覆盖。','照片记录的用途尚未核对是否有后续调整。'],floorNote:'可按楼层查找；具体门位尚未标注。',floors:[1,2,3,4,5,6],rooms:indexedRooms}
];
export const sourceUrl = 'https://xiaoqing.fjsmu.edu.cn/map';
for(const traced of campus.coreBuildings){
  const b=buildings.find(b=>b.id===traced.id);
  b.position=[traced.position[0],0,traced.position[1]];b.modelScale=traced.scale;b.rotation=traced.rotation;
  b.labelHeight*=traced.scale[1];b.positionStatus=traced.status;
  b.sources.push('坐标框影像近似描绘；非测绘点位');
  b.facts.push('当前位置在统一米制框中近似描绘，朝向与间距仍需现场核对。');
}
for(const traced of campus.contextBuildings){
  const center=traced.points.reduce((p,q)=>[p[0]+q[0]/traced.points.length,p[1]+q[1]/traced.points.length],[0,0]);
  const local=p=>[p[0]-center[0],p[1]-center[1]];
  buildings.push({id:'outline-'+traced.id,name:traced.name??(traced.id.startsWith('N')?'北区':'南区')+'建筑轮廓 '+traced.id,aliases:traced.aliases??[],category:traced.category??'unverified',categoryLabel:traced.name?'照片对应建筑':'身份待核对',model:'footprint',
    position:[center[0],0,center[1]],positionStatus:traced.status,labelHeight:traced.height+5,
    footprint:traced.points.map(local),holes:traced.holes.map(ring=>ring.map(local)),visualHeight:traced.height,
    description:traced.name?'轮廓按参考影像近似描绘，具体立面与楼层资料继续核对。':'已记录建筑轮廓，真实名称、用途和立面待核对。',
    sources:['坐标框影像近似描绘',...(traced.sourcePhotos??[]).map(n=>'现场照片/截图 '+n)],
    facts:['显示高度为视觉参数，不代表实测高度或准确楼层数。','位置与轮廓为近似描绘；未完成全部现场核对。'],floorNote:'尚无核对通过的楼层教室资料。',floors:[],rooms:[]});
}
