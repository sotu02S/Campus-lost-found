// Vercel Serverless Function for Storage using Postgres (FREE TIER)
import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Create table if it doesn't exist
        await sql`
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Create flagged items table
        await sql`
            CREATE TABLE IF NOT EXISTS flagged_items (
                id SERIAL PRIMARY KEY,
                item_id TEXT NOT NULL,
                reason TEXT,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        if (req.method === 'POST') {
            // Save or update data
            const { key, data } = req.body;
            
            if (!key || !data) {
                return res.status(400).json({ error: 'Key and data are required' });
            }

            // Upsert (insert or update)
            await sql`
                INSERT INTO items (id, data, updated_at)
                VALUES (${key}, ${JSON.stringify(data)}, CURRENT_TIMESTAMP)
                ON CONFLICT (id) 
                DO UPDATE SET data = ${JSON.stringify(data)}, updated_at = CURRENT_TIMESTAMP;
            `;

            return res.status(200).json({ success: true, key });
        }

        if (req.method === 'GET') {
            const { key, list } = req.query;

            if (list === 'true') {
                // Get all items
                const result = await sql`
                    SELECT id, data FROM items 
                    WHERE id LIKE 'item_%'
                    ORDER BY created_at DESC;
                `;

                const items = result.rows.map(row => ({
                    id: row.id,
                    ...row.data
                }));

                return res.status(200).json(items);
            }

            if (key) {
                // Get specific item
                const result = await sql`
                    SELECT data FROM items WHERE id = ${key};
                `;
                
                if (result.rows.length === 0) {
                    return res.status(404).json({ error: 'Item not found' });
                }

                return res.status(200).json(result.rows[0].data);
            }

            return res.status(400).json({ error: 'Key or list parameter required' });
        }

        if (req.method === 'DELETE') {
            const { key } = req.query;
            
            if (!key) {
                return res.status(400).json({ error: 'Key is required' });
            }

            await sql`DELETE FROM items WHERE id = ${key};`;

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Storage error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
