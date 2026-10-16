import { verifyMoreExpansion, moreData } from './test-more-e2e.mjs';

export async function runNegativeTests() {
  console.log('==================================================');
  console.log('🧪 NASA Eyes More 长文展开端到端反向测试套件');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function assertFailure(testName, result, expectedErrorSubstring) {
    if (result.ok === false) {
      const match = !expectedErrorSubstring || result.errors.some((e) => e.includes(expectedErrorSubstring));
      if (match) {
        passed++;
        console.log(`✅ [通过反向校验] ${testName}`);
        console.log(`   成功拦截到预期错误: ${result.errors[0].replace(/\n/g, ' ')}`);
      } else {
        failed++;
        console.log(`❌ [失败] ${testName}: 虽判定失败，但未包含预期错误关键词 "${expectedErrorSubstring}"`);
        console.log(`   实际错误:`, result.errors);
      }
    } else {
      failed++;
      console.log(`❌ [严重缺陷] ${testName}: 异常状态被误判为 PASS 通过！`);
    }
  }

  // 基准合法数据（以 sun 为例）
  const sunEntry = moreData.entries['sun'];
  const validSunParagraphs = sunEntry.paragraphs.map((p) => p.zh);
  const validSunText = validSunParagraphs.join('\n\n');
  const validBlurb = '太阳是太阳系的中心天体。';

  // 1. 反向测试 1: 中文段落中残留完整英文句子时必须失败
  {
    const contaminatedParas = [...validSunParagraphs];
    contaminatedParas[1] = '太阳与地球之间的联系驱动着季节。Though it is special to us, there are billions of stars like our Sun scattered across the Milky Way galaxy.我们的太阳系正在高速移动。';
    const textWithEnglish = contaminatedParas.join('\n\n');

    const res = verifyMoreExpansion({
      actualMoreText: textWithEnglish,
      blurbText: validBlurb,
      slug: 'sun',
      entry: sunEntry,
      btnAfterMore: '收起',
      btnAfterCollapse: '阅读更多'
    });
    assertFailure('反向测试 1: 中文段落中残留完整英文句子时必须失败', res, '第 2 段内容与预期译文不匹配');
  }

  // 2. 反向测试 2: 收起后按钮文案仍显示 "Less" 时必须失败
  {
    const res = verifyMoreExpansion({
      actualMoreText: validSunText,
      blurbText: validBlurb,
      slug: 'sun',
      entry: sunEntry,
      btnAfterMore: '收起',
      btnAfterCollapse: 'Less'
    });
    assertFailure('反向测试 2: 收起后按钮文案仍显示 "Less" 时必须失败', res, '收起后按钮文案错误');
  }

  // 3. 反向测试 3: 展开按钮文案非 "收起" (如仍为 "More") 时必须失败
  {
    const res = verifyMoreExpansion({
      actualMoreText: validSunText,
      blurbText: validBlurb,
      slug: 'sun',
      entry: sunEntry,
      btnAfterMore: 'More',
      btnAfterCollapse: '阅读更多'
    });
    assertFailure('反向测试 3: 展开按钮文案未翻译为 "收起" 时必须失败', res, '展开按钮文案错误');
  }

  // 4. 反向测试 4: 占位符 [##moon_count##] 未被替换时必须失败
  {
    const saturnEntry = moreData.entries['saturn'];
    // 包含未替换的字面占位符 [##moon_count##]
    const unreplacedText = saturnEntry.paragraphs[0].zh;
    const res = verifyMoreExpansion({
      actualMoreText: unreplacedText,
      blurbText: '土星拥有庞大的卫星系统。',
      slug: 'saturn',
      entry: saturnEntry,
      btnAfterMore: '收起',
      btnAfterCollapse: '阅读更多'
    });
    assertFailure('反向测试 4: 卫星占位符 [##moon_count##] 未替换为数字时必须失败', res, '内容与预期译文不匹配');
  }

  // 5. 反向测试 5: 段落数量缺失时必须失败
  {
    const truncatedText = validSunParagraphs[0]; // 缺失后两段
    const res = verifyMoreExpansion({
      actualMoreText: truncatedText,
      blurbText: validBlurb,
      slug: 'sun',
      entry: sunEntry,
      btnAfterMore: '收起',
      btnAfterCollapse: '阅读更多'
    });
    assertFailure('反向测试 5: 展开长文段落缺失时必须失败', res, '段落数量不一致');
  }

  console.log('\n================ 反向测试结果汇总 ================');
  console.log(`总计: 5，通过: ${passed}，失败: ${failed}`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

// 支持直接运行
if (process.argv[1]?.endsWith('test-more-negative.mjs')) {
  runNegativeTests().catch((err) => {
    console.error('Fatal error in negative test:', err);
    process.exit(1);
  });
}
