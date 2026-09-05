// 現在地の住所。
//
// 緯度経度を出されても、そこがどこかは分からない。最寄り駅の名前でも
// 「新宿の近く」までしか言えない。**住所は人に見せられる。**
// 言葉が通じないとき、駅員やタクシーに画面を見せれば伝わる。
//
// 国土地理院の逆ジオコーディング。鍵なし・CORS 開放。
// 市区町村コードと町名しか返さないので、コードは同梱の表で名前に直す。
// https://maps.gsi.go.jp/development/api.html

const ENDPOINT = 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress'

/** 同じ場所を何度も引かない。座標は小数 4 桁 (約 10m) で丸めて鍵にする。 */
const cache = new Map()

/**
 * 住所を引く。取れなければ null。
 *
 * 日本語のままにする。訳が無いのもあるが、それ以前に
 * **住所は人に見せて伝えるもの**で、現地の表記でないと役に立たない。
 *
 * @param {number} lat
 * @param {number} lon
 * @param {Record<string, string>} municipalities  市区町村コード → 名前
 * @returns {Promise<string|null>}
 */
export async function addressAt(lat, lon, municipalities) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`
  if (cache.has(key)) return cache.get(key)

  const promise = (async () => {
    try {
      const res = await fetch(`${ENDPOINT}?lat=${lat}&lon=${lon}`)
      if (!res.ok) return null
      const { results } = await res.json()
      if (!results) return null

      const muni = municipalities?.[results.muniCd] ?? ''
      const town = results.lv01Nm ?? ''
      // 海上など、どちらも取れないことがある。
      const full = `${muni}${town}`.trim()
      return full || null
    } catch {
      // 圏外なら住所は出さない。座標と最寄り駅は残る。
      return null
    }
  })()

  cache.set(key, promise)
  return promise
}
