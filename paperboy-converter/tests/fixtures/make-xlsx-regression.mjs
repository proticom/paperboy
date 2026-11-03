// Writes the OOXML and BIFF5 bytes by hand so the fixtures do not depend on the SheetJS version under test.
// The SheetJS BIFF5 writer also cannot produce them: it replaces non-Latin text with underscores.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";

const directory = resolve(process.argv[2] || ".");
mkdirSync(directory, { recursive: true });

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const OFFICE_RELS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const FIRST_CUSTOM_FORMAT_ID = 164;

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const indexOfOrPush = (list, item) => {
  const found = list.indexOf(item);
  return found >= 0 ? found : list.push(item) - 1;
};

const sharedStrings = [];
const customFormats = [];
const cellFormats = [0];

const styleAttribute = (format) => {
  if (format === undefined) return "";
  const id =
    typeof format === "number"
      ? format
      : FIRST_CUSTOM_FORMAT_ID + indexOfOrPush(customFormats, format);
  return ` s="${indexOfOrPush(cellFormats, id)}"`;
};

const sharedCell = (markup) => ({
  attributes: ' t="s"',
  body: `<v>${indexOfOrPush(sharedStrings, `<si>${markup}</si>`)}</v>`,
});
const text = (value) => sharedCell(`<t xml:space="preserve">${escapeXml(value)}</t>`);
const richText = (...runs) =>
  sharedCell(
    runs
      .map(
        ([value, bold]) =>
          `<r>${bold ? "<rPr><b/></rPr>" : ""}<t xml:space="preserve">${escapeXml(value)}</t></r>`,
      )
      .join(""),
  );
const inlineText = (value) => ({
  attributes: ' t="inlineStr"',
  body: `<is><t>${escapeXml(value)}</t></is>`,
});
const num = (value, format) => ({ attributes: styleAttribute(format), body: `<v>${value}</v>` });
const bool = (value) => ({ attributes: ' t="b"', body: `<v>${value ? 1 : 0}</v>` });
const error = (value) => ({ attributes: ' t="e"', body: `<v>${escapeXml(value)}</v>` });
const blank = (format = 0) => ({ attributes: styleAttribute(format), body: "" });
const formula = (expression, cached, { type, format } = {}) => ({
  attributes: `${type ? ` t="${type}"` : ""}${styleAttribute(format)}`,
  body: `<f>${escapeXml(expression)}</f><v>${escapeXml(cached)}</v>`,
});

const CURRENCY = '"$"#,##0.00';
const CURRENCY_NEGATIVE_PARENS = '"$"#,##0.00_);[Red]\\("$"#,##0.00\\)';
const EURO = "[$€-407]#,##0.00";
const PERCENT_ONE_DECIMAL = "0.0%";
const NEGATIVE_RED = "#,##0.00;[Red]-#,##0.00";
const CONDITIONAL = '[>=100]"big";"small"';
const BUILTIN = {
  thousands: 3,
  thousandsTwoDecimals: 4,
  percent: 9,
  percentTwoDecimals: 10,
  scientific: 11,
  fraction: 12,
  shortDate: 14,
  dayMonthYear: 15,
  monthYear: 17,
  time12h: 18,
  time24hSeconds: 21,
  shortDateTime: 22,
  accounting: 44,
  textFormat: 49,
};

const MARCH_15_2024 = 45366;

const sheets = [
  {
    name: "Numbers",
    rows: [
      ["Item", "Currency", "Percent", "Thousands", "Other"].map(text),
      [
        text("Widget"),
        num(1234.5, CURRENCY),
        num(0.125, PERCENT_ONE_DECIMAL),
        num(1234567, BUILTIN.thousands),
        num(1234567.891, BUILTIN.thousandsTwoDecimals),
      ],
      [
        text("Refund"),
        num(-42.5, CURRENCY_NEGATIVE_PARENS),
        num(0.5, BUILTIN.percent),
        num(1000, BUILTIN.thousands),
        num(0.000012345, BUILTIN.scientific),
      ],
      [
        text("Euro"),
        num(99.99, EURO),
        num(1.5, BUILTIN.percentTwoDecimals),
        num(999, BUILTIN.thousands),
        num(2.5, BUILTIN.fraction),
      ],
      [
        text("General"),
        num(0.30000000000000004),
        num(12345678901234567000),
        num(0.0000001),
        num(-1234.5678),
      ],
      [
        text("Stored as text"),
        text("007"),
        num(123, BUILTIN.textFormat),
        num(0, BUILTIN.accounting),
        num(-1234.5, NEGATIVE_RED),
      ],
      [text("Conditional"), num(150, CONDITIONAL), num(5, CONDITIONAL), num(-7.25, CURRENCY), num(0, CURRENCY)],
    ],
  },
  {
    name: "Dates",
    rows: [
      ["Format", "Value"].map(text),
      [text("short date"), num(MARCH_15_2024, BUILTIN.shortDate)],
      [text("day month year"), num(MARCH_15_2024, BUILTIN.dayMonthYear)],
      [text("month year"), num(MARCH_15_2024, BUILTIN.monthYear)],
      [text("12 hour time"), num(0.75, BUILTIN.time12h)],
      [text("24 hour time"), num(0.5234375, BUILTIN.time24hSeconds)],
      [text("short date time"), num(MARCH_15_2024 + 0.625, BUILTIN.shortDateTime)],
      [text("iso date"), num(MARCH_15_2024, "yyyy-mm-dd")],
      [text("iso date time"), num(MARCH_15_2024 + 0.625, "yyyy-mm-dd hh:mm:ss")],
      [text("long date"), num(MARCH_15_2024, "dddd, mmmm d, yyyy")],
      [text("elapsed hours"), num(1.5, "[h]:mm:ss")],
      [text("milliseconds"), num(0.123456, "hh:mm:ss.000")],
      [text("day before 1900 leap bug"), num(59, "yyyy-mm-dd")],
      [text("1900 leap bug day"), num(60, "yyyy-mm-dd")],
      [text("day after 1900 leap bug"), num(61, "yyyy-mm-dd")],
    ],
  },
  { name: "Empty", rows: [], dimension: "A1" },
  {
    name: "Mixed",
    dimension: "A1:H12",
    hiddenRows: [9],
    rows: [
      [...["Flag", "Value", "Doubled", "Label", "Note"].map(text), blank(), blank(), blank()],
      [
        bool(true),
        num(21),
        formula("B2*2", 42, { format: BUILTIN.thousands }),
        text("alpha"),
        text("has a | pipe"),
        blank(),
        blank(),
        blank(),
      ],
      [bool(false), blank(), formula("B3*2", 0), text("gap before formula"), text("line one\nline two")],
      [text("gap"), null, null, text("gap after text"), text("pipe | and\nnewline")],
      [null, num(7), null, null, text("starts blank")],
      null,
      [
        formula("A2", 1, { type: "b" }),
        formula('"cached "&D2', "cached alpha", { type: "str" }),
        formula("1/0", "#DIV/0!", { type: "e" }),
        formula('""', "", { type: "str" }),
        error("#N/A"),
      ],
      [blank(), blank(), blank(), blank(), blank()],
      [text("hidden row"), num(9), null, null, text("still exported")],
      [
        text("日本語テキスト"),
        text("Zoë Müller"),
        text("مرحبا"),
        text("Привет"),
        text("🚀 launch & <tags>"),
      ],
      [
        richText(["Bold", true], [" and plain", false]),
        inlineText("inline string"),
        text("  padded  "),
        text("carriage_x000D_\nreturn"),
        text("   "),
      ],
      [num(1), num(2.5), text("x"), text("y"), text("z"), null, null, null],
    ],
  },
  {
    name: "Merged",
    merges: ["A1:C1", "A3:A4", "B5:C5"],
    rows: [
      [text("Merged title"), blank(), blank()],
      ["Region", "First", "Second"].map(text),
      [text("North"), num(10), num(20)],
      [blank(), num(30), num(40)],
      [text("Total"), num(100, CURRENCY), blank()],
    ],
  },
  { name: "Whitespace only", rows: [[text("   "), text("\t")], [text(" ")]] },
  {
    name: "Données 日本",
    rows: [
      ["Clé", "Valeur"].map(text),
      [text("été"), text("naïve café")],
    ],
  },
  {
    name: "Offset",
    origin: { column: 2, row: 3 },
    rows: [
      ["Third", "Fourth"].map(text),
      [num(3), num(4)],
    ],
  },
  { name: "Hidden sheet", state: "hidden", rows: [["Secret", "Value"].map(text), [text("exported"), num(1)]] },
];

const columnName = (index) => String.fromCharCode(65 + index);

const sheetXml = ({ rows, merges = [], dimension, origin = { column: 0, row: 1 }, hiddenRows = [] }) => {
  const rowsXml = rows
    .map((row, rowIndex) => {
      if (row === null) return "";
      const rowNumber = origin.row + rowIndex;
      const cells = row
        .map((cell, columnIndex) =>
          cell === null
            ? ""
            : `<c r="${columnName(origin.column + columnIndex)}${rowNumber}"${cell.attributes}>${cell.body}</c>`,
        )
        .join("");
      const hidden = hiddenRows.includes(rowIndex) ? ' hidden="1"' : "";
      return `<row r="${rowNumber}"${hidden}>${cells}</row>`;
    })
    .join("");
  const width = Math.max(1, ...rows.map((row) => row?.length ?? 0));
  const ref =
    dimension ??
    `${columnName(origin.column)}${origin.row}:${columnName(origin.column + width - 1)}${origin.row + Math.max(rows.length, 1) - 1}`;
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((merge) => `<mergeCell ref="${merge}"/>`).join("")}</mergeCells>`
    : "";
  return `${XML_HEADER}<worksheet xmlns="${MAIN_NS}"><dimension ref="${ref}"/><sheetData>${rowsXml}</sheetData>${mergeXml}</worksheet>`;
};

const sheetParts = sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet)]);

const stylesXml = `${XML_HEADER}<styleSheet xmlns="${MAIN_NS}"><numFmts count="${customFormats.length}">${customFormats
  .map(
    (code, index) =>
      `<numFmt numFmtId="${FIRST_CUSTOM_FORMAT_ID + index}" formatCode="${escapeXml(code)}"/>`,
  )
  .join(
    "",
  )}</numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${cellFormats.length}">${cellFormats
  .map(
    (id) =>
      `<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0"${id === 0 ? "" : ' applyNumberFormat="1"'}/>`,
  )
  .join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const parts = [
  [
    "[Content_Types].xml",
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetParts
      .map(
        ([path]) =>
          `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join(
        "",
      )}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
  ],
  [
    "_rels/.rels",
    `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${OFFICE_RELS_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  ],
  [
    "xl/workbook.xml",
    `${XML_HEADER}<workbook xmlns="${MAIN_NS}" xmlns:r="${OFFICE_RELS_NS}"><sheets>${sheets
      .map(
        ({ name, state }, index) =>
          `<sheet name="${escapeXml(name)}" sheetId="${index + 1}"${state ? ` state="${state}"` : ""} r:id="rId${index + 1}"/>`,
      )
      .join("")}</sheets></workbook>`,
  ],
  [
    "xl/_rels/workbook.xml.rels",
    `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="${OFFICE_RELS_NS}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      )
      .join(
        "",
      )}<Relationship Id="rId${sheets.length + 1}" Type="${OFFICE_RELS_NS}/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="${OFFICE_RELS_NS}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  ],
  ["xl/styles.xml", stylesXml],
  [
    "xl/sharedStrings.xml",
    `${XML_HEADER}<sst xmlns="${MAIN_NS}" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${sharedStrings.join("")}</sst>`,
  ],
  ...sheetParts,
];

const zip = new JSZip();
for (const [path, content] of parts) {
  zip.file(path, content, { createFolders: false, date: new Date(Date.UTC(2024, 0, 1)) });
}
writeFileSync(
  resolve(directory, "xlsx-regression.xlsx"),
  await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
);

const uint16 = (...values) => {
  const bytes = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => bytes.writeUInt16LE(value, index * 2));
  return bytes;
};
const uint32 = (...values) => {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeUInt32LE(value, index * 4));
  return bytes;
};
const float64 = (value) => {
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleLE(value);
  return bytes;
};

const decodeWindows1251 = new TextDecoder("windows-1251");
const windows1251Bytes = new Map(
  Array.from({ length: 128 }, (_, index) => [
    decodeWindows1251.decode(Uint8Array.of(0x80 + index)),
    0x80 + index,
  ]),
);
const cp1251 = (value) =>
  Buffer.from(Array.from(value, (char) => windows1251Bytes.get(char) ?? char.charCodeAt(0)));

const BIFF_RECORD = {
  bof: 0x0809,
  eof: 0x000a,
  codepage: 0x0042,
  font: 0x0031,
  format: 0x041e,
  xf: 0x00e0,
  style: 0x0293,
  boundSheet: 0x0085,
  dimensions: 0x0200,
  label: 0x0204,
  number: 0x0203,
  rk: 0x027e,
};
const BIFF5_VERSION = 0x0500;
const BIFF_SUBSTREAM = { globals: 0x0005, worksheet: 0x0010 };
const CODEPAGE_WINDOWS_1251 = 1251;
const RUBLES_FORMAT_ID = FIRST_CUSTOM_FORMAT_ID;
const STYLE_XF_COUNT = 15;
const CELL_FORMAT_IDS = {
  general: 0,
  thousands: BUILTIN.thousands,
  twoDecimals: BUILTIN.thousandsTwoDecimals,
  percent: BUILTIN.percentTwoDecimals,
  shortDate: BUILTIN.shortDate,
  shortDateTime: BUILTIN.shortDateTime,
  rubles: RUBLES_FORMAT_ID,
};
const xfIndex = (formatName) => STYLE_XF_COUNT + Object.keys(CELL_FORMAT_IDS).indexOf(formatName);

const biffRecord = (type, ...parts) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([uint16(type, body.length), body]);
};
const biffBof = (substream) => biffRecord(BIFF_RECORD.bof, uint16(BIFF5_VERSION, substream, 0x0dbb, 0x07cc));
const biffEof = biffRecord(BIFF_RECORD.eof);
const biffXf = (formatId, flags) =>
  biffRecord(BIFF_RECORD.xf, uint16(0, formatId, flags), Buffer.alloc(10));

const numberCell = (value, formatName) => (row, column) =>
  biffRecord(BIFF_RECORD.number, uint16(row, column, xfIndex(formatName)), float64(value));
const RK_IS_INTEGER = 0b10;
const RK_IS_HUNDREDTHS = 0b01;
const rkIntegerCell = (value, formatName) => (row, column) =>
  biffRecord(BIFF_RECORD.rk, uint16(row, column, xfIndex(formatName)), uint32((value << 2) | RK_IS_INTEGER));
const rkHundredthsCell = (hundredths, formatName) => (row, column) =>
  biffRecord(
    BIFF_RECORD.rk,
    uint16(row, column, xfIndex(formatName)),
    uint32((hundredths << 2) | RK_IS_INTEGER | RK_IS_HUNDREDTHS),
  );
const labelCell = (value) => (row, column) =>
  biffRecord(BIFF_RECORD.label, uint16(row, column, xfIndex("general"), value.length), cp1251(value));

const biffSheets = [
  {
    name: "Данные",
    rows: [
      ["Имя", "Город", "Сумма", "Доля", "Дата"],
      ["Привет", "Москва", numberCell(1234.5, "twoDecimals"), numberCell(0.125, "percent"), numberCell(MARCH_15_2024, "shortDate")],
      ["Ёлка № 7", null, numberCell(-42.5, "rubles"), rkIntegerCell(1, "general"), numberCell(MARCH_15_2024 + 0.625, "shortDateTime")],
      ["Цена €5", "а | б", rkHundredthsCell(1234, "general"), rkIntegerCell(1500, "thousands"), null],
    ],
  },
  {
    name: "Итоги",
    rows: [
      ["Plain ASCII", "Всего"],
      ["unchanged", numberCell(0.30000000000000004, "general")],
    ],
  },
];

const biffSheetStream = ({ rows }) => {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const cells = rows.flatMap((row, rowIndex) =>
    row.flatMap((cell, columnIndex) => {
      if (cell === null) return [];
      const write = typeof cell === "string" ? labelCell(cell) : cell;
      return [write(rowIndex, columnIndex)];
    }),
  );
  return Buffer.concat([
    biffBof(BIFF_SUBSTREAM.worksheet),
    biffRecord(BIFF_RECORD.dimensions, uint16(0, rows.length, 0, columnCount, 0)),
    ...cells,
    biffEof,
  ]);
};

const biffGlobalsStream = (sheetOffsets) => {
  const fontName = cp1251("Arial");
  const font = biffRecord(
    BIFF_RECORD.font,
    uint16(200, 0, 0x7fff, 400, 0),
    Buffer.from([0, 0, 204, 0, fontName.length]),
    fontName,
  );
  const rublesCode = cp1251('#,##0.00" руб."');
  return Buffer.concat([
    biffBof(BIFF_SUBSTREAM.globals),
    biffRecord(BIFF_RECORD.codepage, uint16(CODEPAGE_WINDOWS_1251)),
    ...Array.from({ length: 5 }, () => font),
    biffRecord(BIFF_RECORD.format, uint16(RUBLES_FORMAT_ID), Buffer.from([rublesCode.length]), rublesCode),
    ...Array.from({ length: STYLE_XF_COUNT }, () => biffXf(0, 0xfff5)),
    ...Object.values(CELL_FORMAT_IDS).map((formatId) => biffXf(formatId, 0x0001)),
    biffRecord(BIFF_RECORD.style, uint16(0x8000), Buffer.from([0, 0xff])),
    ...biffSheets.map(({ name }, index) => {
      const encodedName = cp1251(name);
      return biffRecord(
        BIFF_RECORD.boundSheet,
        uint32(sheetOffsets[index]),
        uint16(0),
        Buffer.from([encodedName.length]),
        encodedName,
      );
    }),
    biffEof,
  ]);
};

const sheetStreams = biffSheets.map(biffSheetStream);
const globalsLength = biffGlobalsStream(biffSheets.map(() => 0)).length;
const sheetOffsets = sheetStreams.map(
  (_, index) => globalsLength + sheetStreams.slice(0, index).reduce((sum, stream) => sum + stream.length, 0),
);
const biffStream = Buffer.concat([biffGlobalsStream(sheetOffsets), ...sheetStreams]);

const SECTOR_SIZE = 512;
const MINI_STREAM_CUTOFF = 4096;
const CFB_FREE = 0xffffffff;
const CFB_END_OF_CHAIN = 0xfffffffe;
const CFB_FAT_SECTOR = 0xfffffffd;
const CFB_NO_ENTRY = 0xffffffff;
const CFB_ROOT_ENTRY = 5;
const CFB_STREAM_ENTRY = 2;
const CFB_BLACK = 1;
const FAT_SECTOR_INDEX = 0;
const DIRECTORY_SECTOR_INDEX = 1;
const FIRST_STREAM_SECTOR_INDEX = 2;

const padded = (bytes, length) => Buffer.concat([bytes, Buffer.alloc(length - bytes.length)]);

const directoryEntry = ({ name, type, child = CFB_NO_ENTRY, startSector = CFB_END_OF_CHAIN, size = 0 }) => {
  const encodedName = Buffer.from(`${name}\0`, "utf16le");
  return Buffer.concat([
    padded(encodedName, 64),
    uint16(encodedName.length),
    Buffer.from([type, CFB_BLACK]),
    uint32(CFB_NO_ENTRY, CFB_NO_ENTRY, child),
    Buffer.alloc(16 + 4 + 16),
    uint32(startSector, size, 0),
  ]);
};
const unusedDirectoryEntry = Buffer.concat([
  Buffer.alloc(64 + 2 + 2),
  uint32(CFB_NO_ENTRY, CFB_NO_ENTRY, CFB_NO_ENTRY),
  Buffer.alloc(16 + 4 + 16 + 4 + 4 + 4),
]);

const compoundFile = (streamName, stream) => {
  // Streams under the cutoff belong in the mini stream, so pad past it and keep one simple sector chain.
  const streamLength =
    Math.ceil(Math.max(stream.length, MINI_STREAM_CUTOFF) / SECTOR_SIZE) * SECTOR_SIZE;
  const streamSectorCount = streamLength / SECTOR_SIZE;
  const fat = [
    CFB_FAT_SECTOR,
    CFB_END_OF_CHAIN,
    ...Array.from({ length: streamSectorCount }, (_, index) =>
      index === streamSectorCount - 1 ? CFB_END_OF_CHAIN : FIRST_STREAM_SECTOR_INDEX + index + 1,
    ),
  ];
  const header = Buffer.concat([
    Buffer.from("d0cf11e0a1b11ae1", "hex"),
    Buffer.alloc(16),
    uint16(0x003e, 0x0003, 0xfffe, 9, 6),
    Buffer.alloc(6),
    uint32(0, 1, DIRECTORY_SECTOR_INDEX, 0, MINI_STREAM_CUTOFF, CFB_END_OF_CHAIN, 0, CFB_END_OF_CHAIN, 0),
    uint32(FAT_SECTOR_INDEX, ...Array.from({ length: 108 }, () => CFB_FREE)),
  ]);
  return Buffer.concat([
    header,
    uint32(...fat, ...Array.from({ length: SECTOR_SIZE / 4 - fat.length }, () => CFB_FREE)),
    directoryEntry({ name: "Root Entry", type: CFB_ROOT_ENTRY, child: 1 }),
    directoryEntry({
      name: streamName,
      type: CFB_STREAM_ENTRY,
      startSector: FIRST_STREAM_SECTOR_INDEX,
      size: streamLength,
    }),
    unusedDirectoryEntry,
    unusedDirectoryEntry,
    padded(stream, streamLength),
  ]);
};

writeFileSync(resolve(directory, "xlsx-regression-biff5-cp1251.xlsx"), compoundFile("Book", biffStream));
