import { verifyQuantitiesEquivalence } from './quantity-parser.mjs';

const testCases = [
  // 1. 正向用例：million 与 万/百万/纯数字换算
  {
    name: '3 million amperes -> 300 万安培',
    en: 'create an electric current of 3 million amperes.',
    zh: '形成 300 万安培的强电流。',
    shouldPass: true
  },
  {
    name: '3 million amperes -> 3,000,000 安培',
    en: 'create an electric current of 3 million amperes.',
    zh: '形成 3,000,000 安培的强电流。',
    shouldPass: true
  },
  {
    name: '3 million amperes -> 3 百万安培',
    en: 'create an electric current of 3 million amperes.',
    zh: '形成 3 百万安培的强电流。',
    shouldPass: true
  },
  // 2. 正向用例：billion 与 亿 换算
  {
    name: '4.5 billion years -> 45 亿年',
    en: 'estimated to be 4.5 billion years old.',
    zh: '据估计已有 45 亿年的历史。',
    shouldPass: true
  },
  // 3. 正向用例：thousand 与 万/千 换算
  {
    name: '50 thousand kilometers -> 5 万千米',
    en: 'distance of 50 thousand kilometers.',
    zh: '距离约为 5 万千米。',
    shouldPass: true
  },
  // 4. 正向用例：范围 + million (40 to 90 million -> 4000 万至 9000 万)
  {
    name: '40 to 90 million years -> 4000 万至 9000 万年',
    en: 'no more than 40 to 90 million years old',
    zh: '不超过 4000 万至 9000 万年',
    shouldPass: true
  },
  // 5. 正向用例：双制式单位 + 千分位数字
  {
    name: '262,000 miles (422,000 kilometers) -> 262,000 英里（422,000 千米）',
    en: 'keeping it at more or less a cozy 262,000 miles (422,000 kilometers) from Jupiter',
    zh: '使其与木星保持在约 262,000 英里（422,000 千米）的距离上',
    shouldPass: true
  },
  // 6. 正向用例：英文月份与日期数字对应 (Jan. 7, 1610 -> 1610 年 1 月 7 日)
  {
    name: 'Jan. 7, 1610 -> 1610 年 1 月 7 日',
    en: 'discovered by Galileo Galilei on Jan. 7, 1610.',
    zh: '由伽利略·伽利莱于 1610 年 1 月 7 日发现。',
    shouldPass: true
  },
  {
    name: 'Mariner 2 与 Dec. 14, 1962 (不误判 Mariner 为 March)',
    en: 'Mariner 2 successfully flew by on Dec. 14, 1962.',
    zh: '水手 2 号于 1962 年 12 月 14 日成功飞掠。',
    shouldPass: true
  },
  {
    name: 'Voyager I 与 Voyager II (罗马数字航天器编号)',
    en: 'The Voyager I and Voyager II encounters provided the first knowledge.',
    zh: '旅行者 1 号和旅行者 2 号的交会探测提供了第一手知识。',
    shouldPass: true
  },
  {
    name: 'September 2007 (英文年月无日份与中文年月对应)',
    en: 'The September 2007 Cassini flyby revealed much of the moon.',
    zh: '卡西尼号在 2007 年 9 月的飞掠揭示了这颗卫星的大部分面貌。',
    shouldPass: true
  },
  {
    name: 'October 13th, 2023 -> 2023 年 10 月 13 日 (序数日份)',
    en: 'launched on October 13th, 2023, and will arrive in 2029.',
    zh: '于 2023 年 10 月 13 日发射升空，并将于 2029 年抵达。',
    shouldPass: true
  },
  {
    name: 'September 26th, 2022 -> 2022 年 9 月 26 日 (序数日份)',
    en: 'collision occurred on September 26th, 2022.',
    zh: '碰撞发生于 2022 年 9 月 26 日。',
    shouldPass: true
  },
  {
    name: 'December of 2020 -> 2020 年 12 月 (带 of 年月)',
    en: 'returned to Earth in December of 2020.',
    zh: '于 2020 年 12 月送回地球。',
    shouldPass: true
  },
  // 7. 反向用例：数值错误 (3 million 错译为 400 万)
  {
    name: '【反向】3 million 错译为 400 万（必须报错）',
    en: 'create an electric current of 3 million amperes.',
    zh: '形成 400 万安培的强电流。',
    shouldPass: false
  },
  // 8. 反向用例：量级错误 (3 million 错译为 30 万)
  {
    name: '【反向】3 million 错译为 30 万（必须报错）',
    en: 'create an electric current of 3 million amperes.',
    zh: '形成 30 万安培的强电流。',
    shouldPass: false
  },
  // 9. 反向用例：普通数字篡改 (10 miles 错写为 12 英里)
  {
    name: '【反向】10 miles 错写为 12 英里（必须报错）',
    en: 'The ice shell is 10 miles thick.',
    zh: '冰壳厚度为 12 英里。',
    shouldPass: false
  },
  // 10. 反向用例：漏译数字 (40 to 100 miles 漏掉 100)
  {
    name: '【反向】40 to 100 miles 漏掉 100（必须报错）',
    en: 'ocean is estimated to be 40 to 100 miles deep.',
    zh: '海洋据估计深达 40 英里。',
    shouldPass: false
  },
  // 11. 反向用例：序数日期与年月错译
  {
    name: '【反向】October 13th 日期错译 (10 月 13 日 错写为 10 月 15 日)',
    en: 'launched on October 13th, 2023.',
    zh: '于 2023 年 10 月 15 日发射。',
    shouldPass: false
  },
  {
    name: '【反向】December of 2020 年月错译 (12 月 错写为 11 月)',
    en: 'returned to Earth in December of 2020.',
    zh: '于 2020 年 11 月送回地球。',
    shouldPass: false
  }
];

console.log('==================================================');
console.log('🧪 数值换算与一致性校验单元测试套件');
console.log('==================================================\n');

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const res = verifyQuantitiesEquivalence(tc.en, tc.zh);
  const actualPass = res.ok;
  if (actualPass === tc.shouldPass) {
    passed++;
    console.log(`✅ [通过] ${tc.name}`);
  } else {
    failed++;
    console.log(`❌ [失败] ${tc.name}`);
    console.log(`   预期通过: ${tc.shouldPass}, 实际通过: ${actualPass}`);
    console.log(`   en 解析值:`, res.enVals);
    console.log(`   zh 解析值:`, res.zhVals);
    if (res.missingInZh.length) console.log(`   缺失值:`, res.missingInZh);
    if (res.extraInZh.length) console.log(`   多余值:`, res.extraInZh);
  }
}

console.log('\n================ 测试结果汇总 ================');
console.log(`总计: ${testCases.length}，通过: ${passed}，失败: ${failed}`);
console.log('==============================================');

if (failed > 0) process.exit(1);
