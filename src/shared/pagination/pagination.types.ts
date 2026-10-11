export interface OrderBy {
    readonly property: string;
    readonly direction: 'asc' | 'desc';
}

export interface PageRequest<TWhere = Record<string, unknown>> {
    readonly page?: number;
    readonly pageSize?: number;
    readonly orderBy?: readonly OrderBy[];
    readonly searchText?: string;
    readonly searchFields?: readonly string[];
    readonly where?: TWhere;
}

export interface PageInfo {
    readonly page: number;
    readonly pageSize: number;
    readonly totalRecords: number;
    readonly totalPages: number;
}

export interface Page<T> {
    readonly data: T[];
    readonly pagination: PageInfo;
}
