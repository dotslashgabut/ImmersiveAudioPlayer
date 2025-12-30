
export const applyTextCase = (text: string, casing: 'none' | 'upper' | 'lower' | 'title' | 'sentence' | 'invert' | string): string => {
    if (!text) return "";
    switch (casing) {
        case 'upper':
            return text.toUpperCase();
        case 'lower':
            return text.toLowerCase();
        case 'title':
            return text.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
        case 'sentence':
            return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        case 'invert':
            return text.replace(/\w\S*/g, (txt) => txt.charAt(0).toLowerCase() + txt.substr(1).toUpperCase());
        case 'none':
        default:
            return text;
    }
};
