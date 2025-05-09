---
title: "ウェブページから抽出したMermaid SVGが正しく表示されない？ハマりどころと解決への道筋"
emoji: "🤔"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [SVG, Mermaid, Webスクレイピング, Markdown, Python]
published: true
published_at: 2025-05-10
---

### はじめに

ウェブサイトやドキュメントでよく見かけるMermaid.jsで描画された図。これらをプログラムで抽出し、Markdownドキュメントなどで再利用しようとした際に、SVGが期待通りに表示されず頭を抱えた経験はありませんか？例えば、図の一部しか表示されなかったり、大切なテキストが消えてしまったり... 本記事では、筆者が実際にそのようなSVG表示問題に直面し、その原因を一つ一つ解き明かし、最終的に解決に至るまでの具体的なプロセスと得られた知見を共有します。

この記事は、特に以下のような課題をお持ちの方に役立つことを目指しています。

* ウェブスクレイピングやHTML解析を通じてSVGデータを扱っている開発者の方
* Mermaid.jsで生成されたSVGを他の環境で表示しようとして、表示の不具合に悩んでいる方
* SVGの基本的な仕様や、単独ファイルとしてSVGを表示する際の注意点について、実践的な理解を深めたい方

この記事を通じて、同様のSVG表示問題に直面した際に、そのトラブルシューティングの進め方や具体的な解決策を見つけるための一助となれば幸いです。

### 事象

今回、筆者は特定のウェブページから情報を抽出し、Markdown形式のドキュメントを生成するツールを開発していました。その過程で、ページ内にMermaid.jsによって動的に描画されていたSVG図を抽出し、Markdown内で画像として表示しようとしたところ、いくつかの深刻な表示問題に直面しました。

主に発生したのは、以下の3つの問題です。

1.  **SVGが一部分しか表示されない（クリッピング問題）**
    抽出して保存したSVGファイルを開くと、期待していた図全体の代わりに、左上の一部分だけが切り取られたように表示される現象です。この問題は、VSCodeのMarkdownプレビュー機能で確認した際にも、Chromeで直接SVGファイルを開いた場合にも同様に発生しました。
    - ![](https://share.cleanshot.com/MKJVhg6V+)
2.  **SVG内の文字が表示されない**
    SVGの枠線や図形（例えばフローチャートのノードの箱など）は表示されるものの、その中に書かれているはずのノード名やエッジのラベルといったテキスト情報が全く表示されない、という問題も発生しました。ただ、シーケンス図のような一部のMermaid図では文字が問題なく表示されましたが、フローチャートなどのグラフ系の図だけでこのテキスト非表示問題が発生しました。
    - ![](https://share.cleanshot.com/q6ZlGVk5+)

3.  **SVG全体が真っ黒になる**
    トラブルシューティングの初期段階では、SVG内部のスタイル情報を調整しようとして誤って削除してしまった結果、図全体が真っ黒に塗りつぶされてしまうという現象も経験しました。
    - ![](https://share.cleanshot.com/GTlVn7MR+)

これらの問題で、単純にSVGのコードをHTMLから抜き出してファイルに保存するだけでは解決できず、SVGの内部構造、関連する属性、そして表示される環境との複雑な相互作用を理解する必要があることがわかりました。

### 原因

これらの表示問題を解決するために、SVGの仕様、Mermaid.jsが出力するSVGの特性、HTMLを解析してMarkdownに変換するライブラリ（今回はPythonのBeautifulSoupとMarkdownify）の挙動を調査しました。その結果、問題の根本にはいくつかの要因が複雑に絡み合っていることがわかりました。

#### 1. SVGのサイズ属性：`viewBox`, `width`, `height`の正しい理解と設定

SVGを単独のファイルとして、意図した通りのサイズと範囲で表示させるためには、ルート要素である`<svg>`タグに指定される`viewBox`属性、`width`属性、`height`属性の役割を正しく理解し、適切に設定することが不可欠です。

* **`viewBox`の役割とは？**
    `viewBox`属性は、`viewBox="min-x min-y width height"`という形式で4つの数値を持ちます。これはSVG内部の独自の座標系を定義し、そのSVGコンテンツのどの範囲を描画すべきか（そしてその固有のアスペクト比）を指定します。SVGの「本来の設計図上のサイズと表示範囲」を示す設定です。

* **`width`と`height`の役割とは？**
    これらは、SVGが最終的に表示されるべき「器」の実際のサイズを指定します。固定ピクセル値（例: `width="500px"`）や、親要素に対するパーセンテージ（例: `width="100%"`）で指定できます。

* **単独SVGファイル表示時の問題点:**
    * **固定値の問題:** 元のHTMLから`viewBox`の値をそのまま固定ピクセル値として`width`や`height`に設定すると、Markdownプレビューのような表示コンテナがそれより小さい場合にSVGがはみ出して一部分しか見えなくなる原因になりました。
    * **`width="100%"`の罠:** ウェブページ上では、SVGは親要素の幅に合わせてレスポンシブに表示されるよう`width="100%"`や`style="max-width:..."`といった指定がされていることが多いです。しかし、SVGを単独ファイルとして保存した場合、この「100%」の基準となる親要素のコンテキストが失われてしまいます。そのため、ビューアがサイズを適切に解釈できず、極端に小さい表示になったり、一部分しか表示されなかったりする問題が発生しました。

* **解決へのアプローチ:**
    最終的に安定した表示を得るためには、ルート`<svg>`タグに元々指定されていた`width`, `height`, `style`属性を一度クリアし、`viewBox`属性が存在することを前提として、`width="100%"`を設定（これにより表示コンテナの幅に追従するようになります）、そして`preserveAspectRatio="xMidYMid meet"`を確実に設定する、という方針に至りました。`preserveAspectRatio="xMidYMid meet"`は、`viewBox`で定義されたアスペクト比を保ったまま、指定された`width`（この場合は100%）の範囲内にコンテンツ全体が収まるようにスケーリングするための標準的な設定です。

#### 2. SVG要素名・属性名の大文字・小文字の区別：HTMLパーサーの影響

SVGの仕様では要素名や属性名は大文字・小文字を厳密に区別します。これはXMLベースであるSVGの基本的なルールです。

* **`viewBox` vs `viewbox`:**
    調査の過程で、一部のSVGでは、標準的な`viewBox`（キャメルケース）ではなく、`viewbox`（全て小文字）という属性名で出力されているケースが見つかりました。chromeで表示されている元のHTMLでは、`viewBox`、playwrightとBeautifulSoupで取得したHTMLでは`viewbox`（小文字）として認識されていました。これが原因で、SVGを正しく表示できない場合がありました。SVGの属性名は大文字・小文字を区別するため、スクリプト側でこの小文字の`viewbox`を検出し、標準的な`viewBox`に正規化する処理が必要でした。
* **`foreignObject` vs `foreignobject`:**
    特にMermaidのグラフ図のノードラベルなどで使用される重要な要素である`<foreignObject>`が、元のHTMLソースからPythonのBeautifulSoupライブラリ（`html.parser`を使用）で抽出・パースする過程で、`<foreignobject>`（oが小文字）として認識されてしまう問題がありました。HTMLパーサーはHTMLの慣例に従いタグ名を小文字に正規化する傾向があるため、SVGがHTML内に埋め込まれている場合にこのような変換が発生します。これもブラウザやSVGパーサーによる正しい解釈を妨げるため、スクリプトで正規の`foreignObject`（キャメルケース）に修正する必要がありました。

#### 3. `<foreignObject>`内のHTML要素のスタイル設定

Mermaidのグラフ図（フローチャートなど）のノードラベルは、多くの場合、SVGの`<foreignObject>`要素内にHTML（例: `<div><p>テキスト</p></div>`や単なる`<span>テキスト</span>`など）として埋め込まれて描画されます。この仕組みが、文字が表示されない問題を起こしていました。

* **スタイルの喪失と上書き:**
    SVGを単独ファイルとして表示する際、これらの埋め込みHTML要素に元のウェブページで適用されていたCSSスタイル（特に`color`や`font-family`）が失われたり、表示環境（今回の場合はVSCodeのMarkdownプレビューやChromeブラウザ）のデフォルトスタイルに上書きされたりして、結果的に文字が見えなくなってしまっていたのです。例えば、文字色が背景色と同じになっていたり、透明になっていたり、あるいは適切なフォントが適用されていなかったりするケースです。

* **解決策：インラインスタイルによる強制的なスタイル適用:**
    この問題に対処するため、スクリプトで`<foreignObject>`内の主要なHTMLテキストコンテナタグ（`div`, `span`, `p`など）を特定し、それらに対して直接インライン`style`属性を設定しました。具体的には、`color`, `font-family`, `font-size`などを、CSSの`!important`フラグと共に強制的に上書きすることで、文字の視認性を確保できるようになりました。

#### 4. SVG内部`<style>`タグの役割：色情報の維持

Mermaidが生成するSVGは、通常、内部に`<style>`タグを持ちます。このタグには、図形の線の色、ノードの背景色、そしてデフォルトの文字色やフォントファミリーなど、SVG全体の基本的な見た目を定義するCSSルールが含まれています。

* **保持の重要性:**
    この内部`<style>`タグは、SVGの基本的なデザインを維持するために不可欠です。トラブルシューティングの初期段階で、この`<style>`タグを誤って削除してしまった際には、図全体が真っ黒になってしまう（すべての要素がデフォルトの黒で塗りつぶされてしまう）という問題が発生しました。この経験から、内部`<style>`タグは基本的に保持しつつ、問題となる特定のスタイルのみを上書きまたは調整する方針が重要であると分かりました。

#### 5. HTMLパーサーとMarkdownコンバーターの挙動への対応

SVG自体の問題に加え、SVGをHTMLから抽出し、最終的にMarkdownに変換する過程で使用したツールの挙動も、いくつかの問題を引き起こしていました。

* **`<pre>`タグとMarkdownのコードブロック:**
    元のHTMLでMermaidのSVG図が`<pre>`タグ（整形済みテキストを表示するためのHTMLタグ）で囲まれている場合がありました。これをそのまま`markdownify`のようなHTMLからMarkdownへの変換ライブラリに通すと、`<pre>`タグの内容がMarkdownのコードブロック（```）として解釈されてしまいます。その結果、SVG画像を表示するためのMarkdownリンク（例: `![Mermaid Diagram](images/diagram.svg)`)が、意図せずコードブロックの中に記述されてしまい、画像として表示されなくなる問題が発生しました。
    * **解決策:** SVGを処理する前に、Mermaid SVGを囲む`<pre>`タグ全体を一時的なプレースホルダー（例: `<p>%%MERMAID_PLACEHOLDER%%</p>`）にHTML構造レベルで置き換えることで、この問題を回避できるようになりました。また、図とは無関係な、内容が空または空白のみの不要な`<pre>`タグも、`markdownify`処理前にHTML構造から削除することで、余計な空のコードブロックが生成されるのを防ぎました。

* **プレースホルダー文字列のエスケープ問題:**
    上記のようにプレースホルダーを使用する際、プレースホルダー文字列にアンダースコア (`_`) のようなMarkdownで特別な意味を持つ文字が含まれていると、`markdownify`がこれらの文字をエスケープ（例: `\_`）してしまうことがありました。その結果、後でプレースホルダーを実際の画像リンクに文字列置換しようとしても、エスケープされた文字列とは一致せず、置換が失敗するという問題が発生しました。
    * **解決策:** `markdownify`によってエスケープされる可能性のある特殊文字を含まない、より確実なプレースホルダー文字列（例: `HTMLPARSERMERMAIDPLACEHOLDER...ENDHTMLPARSER`のような、英数字のみで構成されるユニークな文字列）を使用することで、この問題に対応できるようになりました。

### 対応：Pythonスクリプトによるアプローチの概要

ここまでの調査結果に従って、Pythonスクリプト（Playwrightで動的にページ内容を取得し、BeautifulSoupでHTMLを解析、Mermaid SVGを抽出し、その属性を慎重に調整して別ファイルに保存、そしてMarkdownifyで本文をMarkdownに変換する）を段階的に修正していきました。

特に重要だったのは、`MermaidDiagram`クラス内のSVG処理ロジックです。ここでは、SVGの寸法を`viewBox`に基づいてレスポンシブに設定しつつ、`foreignObject`内のHTML要素に対して強制的に視認性の高いスタイル（色、フォント、フォントサイズなど）をインラインで適用するという、両面からのアプローチを取りました。

```python
# --- ブログ記事用コードサンプル ---
from bs4 import BeautifulSoup, Tag
import re
import os

VISIBLE_TEXT_COLOR = "#202020"  # やや黒に近いグレー
GENERIC_FONT_FAMILY = "Arial, Helvetica, sans-serif" # 一般的なサンセリフフォント
DEFAULT_FONT_SIZE = "14px" # デフォルトのフォントサイズ
FOREIGN_OBJECT_TEXT_STYLE = (
    f"color: {VISIBLE_TEXT_COLOR} !important; "
    f"font-family: {GENERIC_FONT_FAMILY} !important; "
    f"font-size: {DEFAULT_FONT_SIZE} !important; "
    f"background-color: transparent !important; "
    f"visibility: visible !important; "
    f"opacity: 1 !important; "
    f"display: inline !important; " # foreignObject内のテキストの表示形式
    f"margin: 0 !important; "
    f"padding: 0 !important; "
    f"border: none !important;"
)

def sanitize_filename(filename: str) -> str:
    """ファイル名として安全な文字列に変換するヘルパー関数"""
    sanitized = re.sub(r'[^\w\.-]', '_', filename)
    return sanitized[:100]

def prepare_and_save_svg(
    svg_tag: Tag, # BeautifulSoupでパースされたSVGタグオブジェクト
    original_svg_id: str, # 元のSVGのID（ファイル名生成用）
    output_base_dir: str, # Markdownファイルが保存されるディレクトリ
    chat_block_index: int, # 複数のSVGを区別するためのインデックス
    diagram_index: int    # 同上
) -> Optional[str]:
    """
    SVGコンテンツを処理し、ファイルに保存する。
    成功した場合はSVGファイルへの相対パスを、失敗した場合はNoneを返す。
    """

    # 0. foreignObjectタグ名を正規化 (SVG標準は 'foreignObject')
    #    BeautifulSoupのHTMLパーサーはタグ名を小文字にすることがあるため。
    for fo_lower in svg_tag.find_all('foreignobject', recursive=True):
        fo_lower.name = 'foreignObject'
        # print(f"DEBUG: Normalized 'foreignobject' to 'foreignObject' for ID {original_svg_id}")

    # 1. ルート<svg>タグの属性を整理
    #    既存のwidth, height, style属性を削除 (単独表示時の競合を避けるため)
    for attr in ['width', 'height', 'style']:
        if svg_tag.has_attr(attr):
            del svg_tag[attr]

    #    viewBox属性の処理 (小文字 'viewbox' も考慮し、'viewBox' に正規化)
    viewbox_str = svg_tag.get('viewBox')
    if not viewbox_str: 
        viewbox_str = svg_tag.get('viewbox') 
        if viewbox_str:
            svg_tag['viewBox'] = viewbox_str 
            if svg_tag.has_attr('viewbox'): 
                del svg_tag['viewbox']
    
    #    viewBoxが存在すれば、width="100%" を設定 (レスポンシブ表示のため)
    #    高さはviewBoxのアスペクト比とpreserveAspectRatioによって自動調整されることを期待
    if viewbox_str:
        parts = viewbox_str.split()
        if len(parts) == 4: # 正しいviewBox形式か確認
            svg_tag['width'] = "100%" 
            # height属性は設定しないか、明示的に削除
            if svg_tag.has_attr('height'): 
                del svg_tag['height']
        else:
            # viewboxが不正な場合も、フォールバックとしてwidth="100%"を設定
            svg_tag['width'] = "100%"
            print(f"Warning: Malformed viewBox '{viewbox_str}' for SVG {original_svg_id}.")
    else:
        # viewBoxが存在しない場合、スケーリングが予測不能になる可能性がある
        svg_tag['width'] = "100%" # フォールバック
        print(f"CRITICAL WARNING: SVG {original_svg_id} lacks a viewBox attribute.")

    #    preserveAspectRatioを設定 (アスペクト比を保ちつつ全体を表示)
    svg_tag['preserveAspectRatio'] = 'xMidYMid meet'

    # 2. テキスト要素のスタイルを強制的に設定
    #    SVGネイティブの<text>や<tspan>要素にスタイルを適用
    for text_element in svg_tag.find_all(['text', 'tspan'], recursive=True):
        text_element['fill'] = VISIBLE_TEXT_COLOR
        text_element['font-family'] = GENERIC_FONT_FAMILY
        text_element['font-size'] = DEFAULT_FONT_SIZE
        if text_element.has_attr('style'): # 既存のインラインスタイルは削除して競合を避ける
            del text_element['style']

    #    <foreignObject>内のHTML要素にスタイルを適用
    #    Mermaidのラベルは<foreignObject>内のHTMLでレンダリングされることが多い
    for foreign_object in svg_tag.find_all('foreignObject', recursive=True):
        # foreignObject自体の寸法が適切でないと内容が表示されないことがある
        if not foreign_object.has_attr('width') or foreign_object.get('width', '0').replace('px','').strip() == "0":
            foreign_object['width'] = "100%" 
        if not foreign_object.has_attr('height') or foreign_object.get('height', '0').replace('px','').strip() == "0":
            foreign_object['height'] = "1000" # 十分な高さを確保 (内容はクリッピングされる可能性がある)

        # foreignObject内の一般的なテキストコンテナタグにスタイルを強制適用
        for element in foreign_object.find_all(['div', 'span', 'p', 'font', 'b', 'i', 'strong', 'em', 'label'], recursive=True):
            element['style'] = FOREIGN_OBJECT_TEXT_STYLE
            # print(f"DEBUG: Applied forced style to <{element.name}> in <foreignObject> for SVG {original_svg_id}")


    # 3. SVGをファイルに保存
    images_subdir_name = "images"
    images_dir_path = os.path.join(output_base_dir, images_subdir_name)
    os.makedirs(images_dir_path, exist_ok=True)

    # ファイル名を生成 (元のIDがあればそれを基に、なければインデックスから生成)
    filename_base_id = original_svg_id if original_svg_id else f"mermaid_diagram_{chat_block_index}_{diagram_index}"
    base_filename = sanitize_filename(filename_base_id)
    svg_filename = f"{base_filename}.svg"
    svg_filepath = os.path.join(images_dir_path, svg_filename)

    try:
        # SVGタグオブジェクトを文字列として書き出す
        svg_string_to_write = svg_tag.prettify()
        with open(svg_filepath, "w", encoding="utf-8") as f_svg:
            f_svg.write(svg_string_to_write) 
        
        # Markdownファイルからの相対パスを返す
        relative_svg_path = os.path.join(images_subdir_name, svg_filename)
        return relative_svg_path.replace("\\", "/") # OS依存のパス区切り文字を修正
    except Exception as e:
        print(f"Error during SVG processing or saving for {original_svg_id}: {e}")
        return None

# --- 使用例 ---
# if __name__ == '__main__':
#     # この部分はデモ用です。実際のsvg_tagはBeautifulSoupでパースして取得します。
#     sample_svg_html = """
#     <svg id="mermaid-xyz" viewbox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">
#         <style>/* ... some styles ... */</style>
#         <g>
#             <text x="10" y="20" style="fill: #fff;">Old Text</text>
#             <foreignobject x="50" y="50" width="100" height="50">
#                 <div xmlns="http://www.w3.org/1999/xhtml">
#                     <p style="color: #000; font-family: 'Times New Roman';">Hello</p>
#                 </div>
#             </foreignobject>
#         </g>
#     </svg>
#     """
#     mock_soup = BeautifulSoup(sample_svg_html, 'xml')
#     mock_svg_tag = mock_soup.find('svg')

#     if mock_svg_tag:
#         output_directory = "./test_output" # Markdownファイルが保存されるディレクトリ
#         relative_path = prepare_and_save_svg(
#             svg_tag=mock_svg_tag,
#             original_svg_id=mock_svg_tag.get('id', 'unknown_svg'),
#             output_base_dir=output_directory,
#             chat_block_index=0,
#             diagram_index=0
#         )
#         if relative_path:
#             print(f"SVG saved to: {output_directory}/{relative_path}")
#             print(f"Markdown link: ![Mermaid Diagram]({relative_path})")
#         else:
#             print("Failed to save SVG.")
#     else:
#         print("Sample SVG tag not found.")

```

これらを適用して、期待通りにMarkdownプレビューで表示されるようになりました。

- ![](https://share.cleanshot.com/9kjFLLjz+)

### まとめ：SVGトラブルシューティングの心得

ウェブページから動的に生成されるSVGを抽出し、異なるコンテキストで再利用する際には、一見単純に見えても多くの落とし穴が存在し得ます。今回のMermaid SVGの表示問題との格闘から得られた主な教訓は、以下の通りです。

* **SVGの仕様への立ち返り:** 問題解決の基本は、やはり仕様の理解です。`viewBox`, `width`, `height`, `preserveAspectRatio`, `foreignObject`といったSVGの基本的な属性や要素の役割、そしてXMLベースであること（大文字・小文字の区別など）を正しく理解することが、問題解決の羅針盤となります。
* **外部コンテキストへの依存の排除:** SVGが単独ファイルとして表示される場合、元のHTMLページにあった親要素のサイズやページ全体のCSSといった「外部コンテキスト」は失われます。`width="100%"`のような相対指定や、複雑なCSSセレクタに依存したスタイルは、単独ファイルでは機能しないか、予期せぬ動作をすることがあります。SVGファイル自体が、可能な限り自己完結的に表示内容を定義できるように属性を調整することが重要です。
* **テキストレンダリングの多様性を認識する:** SVG内のテキストは、シンプルな`<text>`要素だけでなく、HTMLを埋め込むための`<foreignObject>`としても描画され得ます。特にMermaidのようなライブラリは後者を多用することがあります。それぞれのケースで、スタイリングのアプローチ（SVG属性かCSSか、ネイティブ要素かHTML要素か）が異なることを認識し、適切に対処する必要があります。
* **利用ツールの挙動を理解する:** HTMLパーサー（今回はBeautifulSoup）がSVGのタグ名や属性名をどのように扱うか（例: HTMLとしてのパース時に小文字に正規化する可能性）、Markdownコンバーター（今回はMarkdownify）が特定のHTML構造（例: `<pre>`タグ）をどのように解釈・変換するかを把握しておくことは、意図しない出力を未然に防ぐために不可欠です。
* **段階的な切り分けと検証の徹底:** SVGの表示に問題が発生した場合、一度に多くの変更を加えるのではなく、原因と思われる箇所を一つずつ仮説を立てて修正し、その都度表示を確認するという地道な作業が、結局は根本原因の特定への近道となります。ブラウザの開発者ツールは、このHTML構造の確認とスタイルの動的なテストにおいて、非常に強力な味方となってくれます。

Mermaid.jsで生成されるSVGは、ドキュメントやコミュニケーションにおいて非常に強力な可視化ツールですが、その内部構造は複雑です。再利用する場合は注意しましょう。

この記事が、同様にウェブページからのSVG抽出と再利用で困難に直面している方々にとって、少しでも問題解決のヒントや勇気を与えることができれば幸いです。

### 参考資料

* SVG 1.1 (Second Edition) Specification - W3C: <https://www.w3.org/TR/SVG11/>
* MDN Web Docs - SVG: <https://developer.mozilla.org/ja/docs/Web/SVG>
* MDN Web Docs - `<foreignObject>`: <https://developer.mozilla.org/ja/docs/Web/SVG/Element/foreignObject>
* Mermaid.js Documentation: <https://mermaid.js.org/>
* Beautiful Soup Documentation (Parsing XML): <https://www.crummy.com/software/BeautifulSoup/bs4/doc/#parsing-xml>
