export const mainlandCities = [
  { name: '北京', adcode: '110000' }, { name: '上海', adcode: '310000' }, { name: '天津', adcode: '120000' }, { name: '重庆', adcode: '500000' },
  { name: '杭州', adcode: '330100' }, { name: '南京', adcode: '320100' }, { name: '苏州', adcode: '320500' }, { name: '无锡', adcode: '320200' },
  { name: '广州', adcode: '440100' }, { name: '深圳', adcode: '440300' }, { name: '珠海', adcode: '440400' }, { name: '佛山', adcode: '440600' },
  { name: '成都', adcode: '510100' }, { name: '西安', adcode: '610100' }, { name: '武汉', adcode: '420100' },
  { name: '长沙', adcode: '430100' }, { name: '厦门', adcode: '350200' }, { name: '福州', adcode: '350100' }, { name: '青岛', adcode: '370200' },
  { name: '济南', adcode: '370100' }, { name: '昆明', adcode: '530100' }, { name: '大理', adcode: '532900' }, { name: '丽江', adcode: '530700' },
  { name: '贵阳', adcode: '520100' }, { name: '南宁', adcode: '450100' }, { name: '海口', adcode: '460100' }, { name: '三亚', adcode: '460200' },
  { name: '郑州', adcode: '410100' }, { name: '洛阳', adcode: '410300' }, { name: '太原', adcode: '140100' }, { name: '沈阳', adcode: '210100' },
  { name: '大连', adcode: '210200' }, { name: '哈尔滨', adcode: '230100' }, { name: '长春', adcode: '220100' }, { name: '拉萨', adcode: '540100' },
]

export function findCityAdcode(cityName: string) {
  return mainlandCities.find((city) => city.name === cityName)?.adcode ?? 'pending'
}
