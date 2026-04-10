/**
 * 品牌域名解析器
 * 根据 feishu / lark 品牌返回对应的 Open API 和 Accounts 域名
 */

export type Brand = "feishu" | "lark";

export interface BrandConfig {
  openBase: string;
  accountsBase: string;
}

const BRAND_CONFIG: Record<Brand, BrandConfig> = {
  feishu: {
    openBase: "https://open.feishu.cn",
    accountsBase: "https://accounts.feishu.cn",
  },
  lark: {
    openBase: "https://open.larksuite.com",
    accountsBase: "https://accounts.larksuite.com",
  },
};

/**
 * 获取指定品牌的域名配置
 */
export function resolveBrand(brand: Brand = "feishu"): BrandConfig {
  const config = BRAND_CONFIG[brand];
  if (!config) {
    throw new Error(`未知品牌: ${brand}，只支持 feishu 或 lark`);
  }
  return config;
}

export default BRAND_CONFIG;
